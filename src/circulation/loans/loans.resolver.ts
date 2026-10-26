import { Inject, UseGuards } from '@nestjs/common';
import {
  Args,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { HoldStatus, Loan, LoanStatus, Prisma, Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles, RolesGuard } from '../../auth';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import { CopiesService } from '../copies/copies.service';
import { IDENTITY_PUBLIC_API, IdentityPublicApi } from '../../users';
import { LoansService } from './loans.service';
import { LoansDataLoader } from './loans.loader';
import { LoanModel } from './models/loan.model';
import { PickupDeskHoldModel } from './models/pickup-desk-hold.model';
import { LoanFilterInput, LoanPaginationInput } from './dto/loan-filter.input';
import { MemberNotFoundError } from './errors';

@Resolver(() => LoanModel)
@UseGuards(RolesGuard)
export class LoansResolver {
  constructor(
    private readonly loansService: LoansService,
    private readonly copiesService: CopiesService,
    private readonly prisma: PrismaService,
    private readonly clockService: ClockService,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityPublicApi: IdentityPublicApi,
    private readonly loansDataLoader: LoansDataLoader,
  ) {}

  // -------------------------------------------------------------
  // STAFF MUTATIONS & QUERIES (LIBRARIAN and ADMIN only)
  // -------------------------------------------------------------

  /**
   * pickupDeskHolds: Retrieves ACTIVE holds ready for pickup at the circulation desk.
   * Batches member name and book title resolutions in ONE DataLoader lookup each.
   */
  @Query(() => [PickupDeskHoldModel], { name: 'pickupDeskHolds' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async pickupDeskHolds(
    @Args('memberEmail', { type: () => String, nullable: true })
    memberEmail?: string,
    @Args('copyBarcode', { type: () => String, nullable: true })
    copyBarcode?: string,
  ): Promise<PickupDeskHoldModel[]> {
    const where: Prisma.HoldWhereInput = {
      status: HoldStatus.ACTIVE,
    };

    if (memberEmail?.trim()) {
      const member = await this.identityPublicApi.findMemberByEmail(
        memberEmail.trim(),
      );
      if (!member) {
        return [];
      }
      where.userId = member.id;
    }

    if (copyBarcode?.trim()) {
      const copy = await this.prisma.copy.findUnique({
        where: { barcode: copyBarcode.trim() },
      });
      if (!copy) {
        return [];
      }
      where.copyId = copy.id;
    }

    const holds = await this.prisma.hold.findMany({
      where,
      include: { copy: true },
      orderBy: { expiresAt: 'asc' },
    });

    return Promise.all(
      holds.map(async (hold) => ({
        id: hold.id,
        userId: hold.userId,
        memberName: await this.loansDataLoader.loadMemberName(hold.userId),
        bookId: hold.bookId,
        bookTitle: await this.loansDataLoader.loadBookTitle(hold.bookId),
        copyId: hold.copyId,
        copyBarcode: hold.copy.barcode,
        pickupDeadline: hold.expiresAt,
        createdAt: hold.createdAt,
      })),
    );
  }

  /**
   * confirmPickup: Fulfills a member's active hold into an active loan.
   * Subject to staff throttler limit (20 req/min).
   */
  @Mutation(() => LoanModel, { name: 'confirmPickup' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async confirmPickup(
    @Args('holdId', { type: () => Int }) holdId: number,
    @Args('copyBarcode', { type: () => String }) copyBarcode: string,
    @CurrentUser() staff: AuthenticatedUser,
  ): Promise<Loan> {
    return this.loansService.confirmPickup(holdId, copyBarcode, staff.sub);
  }

  /**
   * checkoutCopy: Lends an available copy to a walk-in member by email.
   * Subject to staff throttler limit (20 req/min).
   */
  @Mutation(() => LoanModel, { name: 'checkoutCopy' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async checkoutCopy(
    @Args('memberEmail', { type: () => String }) memberEmail: string,
    @Args('copyBarcode', { type: () => String }) copyBarcode: string,
    @CurrentUser() staff: AuthenticatedUser,
  ): Promise<Loan> {
    const member = await this.identityPublicApi.findMemberByEmail(
      memberEmail.trim(),
    );
    if (!member) {
      throw new MemberNotFoundError(memberEmail.trim());
    }

    return this.loansService.checkoutCopy(member.id, copyBarcode, staff.sub);
  }

  /**
   * loans: Staff lookup for loans with status, member, book, and overdue filters.
   */
  @Query(() => [LoanModel], { name: 'loans' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async loans(
    @Args('filter', { type: () => LoanFilterInput, nullable: true })
    filter?: LoanFilterInput,
    @Args('pagination', { type: () => LoanPaginationInput, nullable: true })
    pagination?: LoanPaginationInput,
  ): Promise<Loan[]> {
    const { items } = await this.loansService.listStaffLoans(
      filter,
      pagination,
    );
    return items;
  }

  /**
   * loan: Staff lookup for a single loan by primary key ID.
   */
  @Query(() => LoanModel, { name: 'loan' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async loan(@Args('id', { type: () => Int }) id: number): Promise<Loan> {
    return this.loansService.getLoan(id);
  }

  // -------------------------------------------------------------
  // MEMBER QUERIES
  // -------------------------------------------------------------

  /**
   * myLoans: Retrieves loans for the currently authenticated user.
   * Physical copy barcodes are redacted from member responses.
   */
  @Query(() => [LoanModel], { name: 'myLoans' })
  async myLoans(
    @CurrentUser() user: AuthenticatedUser,
    @Args('status', { type: () => LoanStatus, nullable: true })
    status?: LoanStatus,
  ): Promise<Loan[]> {
    return this.loansService.listMemberLoans(user.sub, status);
  }

  // -------------------------------------------------------------
  // FIELD RESOLVERS
  // -------------------------------------------------------------

  /**
   * bookTitle: Resolves book title via Catalog DataLoader (single batched query).
   */
  @ResolveField(() => String, { name: 'bookTitle' })
  async resolveBookTitle(@Parent() loan: Loan): Promise<string> {
    return this.loansDataLoader.loadBookTitle(loan.bookId);
  }

  /**
   * copyBarcode: Staff-only field.
   * Returns null if requested by a MEMBER to prevent inventory leakage.
   */
  @ResolveField(() => String, { name: 'copyBarcode', nullable: true })
  async resolveCopyBarcode(
    @Parent() loan: Loan & { copy?: { barcode: string } },
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<string | null> {
    if (!user || user.role === Role.MEMBER) {
      return null;
    }

    if (loan.copy?.barcode) {
      return loan.copy.barcode;
    }

    try {
      const copy = await this.copiesService.findById(loan.copyId);
      return copy.barcode;
    } catch {
      return null;
    }
  }

  /**
   * isOverdue: Evaluated dynamically based on current clock time.
   */
  @ResolveField(() => Boolean, { name: 'isOverdue' })
  resolveIsOverdue(@Parent() loan: Loan): boolean {
    return this.loansService.isOverdue(loan);
  }

  /**
   * daysRemaining: Returns remaining calendar days if loan is ACTIVE and on-time.
   */
  @ResolveField(() => Int, { name: 'daysRemaining' })
  resolveDaysRemaining(@Parent() loan: Loan): number {
    if (loan.status !== LoanStatus.ACTIVE) {
      return 0;
    }

    const now = this.clockService.now();
    if (now > loan.dueAt) {
      return 0;
    }

    const diffMs = loan.dueAt.getTime() - now.getTime();
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  }

  /**
   * daysLate: Returns number of calendar days late if loan is ACTIVE and overdue.
   */
  @ResolveField(() => Int, { name: 'daysLate' })
  resolveDaysLate(@Parent() loan: Loan): number {
    if (loan.status !== LoanStatus.ACTIVE) {
      return 0;
    }

    const now = this.clockService.now();
    if (now <= loan.dueAt) {
      return 0;
    }

    const diffMs = now.getTime() - loan.dueAt.getTime();
    return Math.ceil(diffMs / (24 * 60 * 60 * 1000));
  }
}
