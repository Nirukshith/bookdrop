import { Args, Parent, Query, ResolveField, Resolver } from '@nestjs/graphql';
import { NotFoundException, UseGuards, Inject } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles, RolesGuard } from '../../auth';
import { PrismaService } from '../../prisma/prisma.service';
import { MISSED_PICKUPS_BEFORE_FINE } from '../../config/library-rules';
import { IDENTITY_PUBLIC_API, IdentityPublicApi } from '../../users';
import {
  MissedPickupsSummaryModel,
  RecentMissedPickupModel,
} from './models/missed-pickup.model';
import { MissedPickupsDataLoader } from './missed-pickups.loader';

@Resolver(() => MissedPickupsSummaryModel)
@UseGuards(RolesGuard)
export class MissedPickupsResolver {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityPublicApi: IdentityPublicApi,
  ) {}

  @Query(() => MissedPickupsSummaryModel, {
    name: 'myMissedPickups',
    description:
      'Returns the authenticated member unassessed missed-pickup count, fine threshold, and recent missed pickups.',
  })
  @Roles(Role.MEMBER)
  async myMissedPickups(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MissedPickupsSummaryModel> {
    const memberId = user.sub;
    return this.getMissedPickupsSummary(memberId);
  }

  @Query(() => MissedPickupsSummaryModel, {
    name: 'memberMissedPickups',
    description:
      'Staff query to look up a member missed-pickup history by email address.',
  })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async memberMissedPickups(
    @Args('memberEmail') memberEmail: string,
  ): Promise<MissedPickupsSummaryModel> {
    const member = await this.identityPublicApi.findMemberByEmail(memberEmail);
    if (!member) {
      throw new NotFoundException(
        `Member with email "${memberEmail}" not found`,
      );
    }
    return this.getMissedPickupsSummary(member.id);
  }

  private async getMissedPickupsSummary(
    userId: number,
  ): Promise<MissedPickupsSummaryModel> {
    const unassessedCount = await this.prisma.missedPickup.count({
      where: {
        userId,
        fineId: null,
        excused: false,
      },
    });

    const recentRecords = await this.prisma.missedPickup.findMany({
      where: { userId },
      include: {
        hold: {
          select: { bookId: true },
        },
      },
      orderBy: { id: 'desc' },
      take: 10,
    });

    const recent: RecentMissedPickupModel[] = recentRecords.map((r) => ({
      id: r.id,
      holdId: r.holdId,
      bookId: r.hold.bookId,
      missedAt: r.createdAt,
      excused: r.excused,
      excusedReason: r.excusedReason,
    }));

    return {
      unassessedCount,
      threshold: MISSED_PICKUPS_BEFORE_FINE,
      recent,
    };
  }
}

@Resolver(() => RecentMissedPickupModel)
@UseGuards(RolesGuard)
export class RecentMissedPickupResolver {
  constructor(private readonly dataLoader: MissedPickupsDataLoader) {}

  @ResolveField(() => String, { name: 'bookTitle', nullable: true })
  async resolveBookTitle(
    @Parent() item: RecentMissedPickupModel,
  ): Promise<string> {
    return this.dataLoader.loadBookTitle(item.bookId);
  }
}
