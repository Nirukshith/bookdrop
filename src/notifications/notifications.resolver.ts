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
        nextAttemptAt: new Date(),
        lastError: null,
      },
    });
  }
}
