import {
  BadRequestException,
  Inject,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles, RolesGuard } from '../auth';
import { PrismaService } from '../prisma/prisma.service';
import { ClockService } from '../common/clock';
import { IDENTITY_PUBLIC_API, IdentityPublicApi } from '../users';
import { NotificationPaginationInput } from './dto/notification-pagination.input';
import { NotificationModel } from './models/notification.model';
import { transitionNotification } from './notification-state-machine';
import { NotificationStatus } from './notification.types';

@Resolver(() => NotificationModel)
@UseGuards(RolesGuard)
export class NotificationsResolver {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityPublicApi: IdentityPublicApi,
    private readonly clock: ClockService,
  ) {}

  /**
   * myNotifications: Returns notification history for the authenticated member.
   */
  @Query(() => [NotificationModel], { name: 'myNotifications' })
  async myNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Args('pagination', {
      type: () => NotificationPaginationInput,
      nullable: true,
    })
    pagination?: NotificationPaginationInput,
  ): Promise<NotificationModel[]> {
    return this.prisma.notification.findMany({
      where: { userId: user.sub },
      orderBy: { createdAt: 'desc' },
      take: pagination?.take ?? 20,
      skip: pagination?.skip ?? 0,
    });
  }

  /**
   * myUnreadNotificationCount: Number of the member's notifications not yet seen
   * in the portal (drives the badge on the Notifications item). Cancelled
   * notifications were never meant for the member and are not counted.
   */
  @Query(() => Int, { name: 'myUnreadNotificationCount' })
  async myUnreadNotificationCount(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        userId: user.sub,
        readAt: null,
        status: { not: NotificationStatus.CANCELLED },
      },
    });
  }

  /**
   * markMyNotificationsRead: Marks all of the member's unread notifications as
   * read (called when they open their notifications). Returns how many changed.
   */
  @Mutation(() => Int, { name: 'markMyNotificationsRead' })
  async markMyNotificationsRead(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: { userId: user.sub, readAt: null },
      data: { readAt: this.clock.now() },
    });
    return result.count;
  }

  /**
   * memberNotifications: Staff query to inspect notifications sent to a specific member.
   */
  @Query(() => [NotificationModel], { name: 'memberNotifications' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async memberNotifications(
    @Args('memberEmail', { type: () => String }) memberEmail: string,
    @Args('pagination', {
      type: () => NotificationPaginationInput,
      nullable: true,
    })
    pagination?: NotificationPaginationInput,
  ): Promise<NotificationModel[]> {
    const member = await this.identityPublicApi.findMemberByEmail(memberEmail);
    if (!member) {
      throw new NotFoundException('Member not found with the provided email');
    }

    return this.prisma.notification.findMany({
      where: { userId: member.id },
      orderBy: { createdAt: 'desc' },
      take: pagination?.take ?? 20,
      skip: pagination?.skip ?? 0,
    });
  }

  /**
   * retryNotification: Admin mutation to reset a FAILED notification back to PENDING.
   */
  @Mutation(() => NotificationModel, { name: 'retryNotification' })
  @Roles(Role.ADMIN)
  async retryNotification(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<NotificationModel> {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.status !== NotificationStatus.FAILED) {
      throw new BadRequestException('Only FAILED notifications can be retried');
    }

    // Verify transition with the state machine
    transitionNotification(notification.status, NotificationStatus.PENDING);

    return this.prisma.notification.update({
      where: { id },
      data: {
        status: NotificationStatus.PENDING,
        attempts: 0,
        // Due immediately by the send job's clock.
        nextAttemptAt: this.clock.now(),
        lastError: null,
      },
    });
  }
}
