import { Inject, UseGuards, BadRequestException } from '@nestjs/common';
import {
  Args,
  Float,
  ID,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { Throttle } from '@nestjs/throttler';
import { Fine, FinePayment, FineStatus, Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles, RolesGuard } from '../../auth';
import { PrismaService } from '../../prisma/prisma.service';
import { IDENTITY_PUBLIC_API, IdentityPublicApi } from '../../users';
import { MemberNotFoundError } from '../loans/errors/member-not-found.error';
import { FinesService } from './fines.service';
import { FinesDataLoader } from './fines.loader';
import { FineModel, FinePaymentModel, MyFineModel } from './models';
import { FineFilterInput, FinePaginationInput } from './dto/fine-filter.input';
import { minorToRs, parseRupeesToMinor } from './utils/currency-edge.util';

@Resolver(() => FineModel)
@UseGuards(RolesGuard)
export class FinesResolver {
  constructor(
    private readonly finesService: FinesService,
    private readonly prisma: PrismaService,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityPublicApi: IdentityPublicApi,
  ) {}

  // -------------------------------------------------------------
  // STAFF MUTATIONS (LIBRARIAN and ADMIN)
  // -------------------------------------------------------------

  /**
   * recordFinePayment: Records a payment towards an outstanding fine.
   * Subject to staff throttler limit (20 req/min).
   */
  @Mutation(() => FineModel, { name: 'recordFinePayment' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async recordFinePayment(
    @Args('fineId', { type: () => ID }) fineId: number,
    @Args('amountRs', { type: () => Float }) amountRs: number,
    @Args('note', { type: () => String, nullable: true }) note?: string,
    @CurrentUser() staff?: AuthenticatedUser,
  ): Promise<Fine> {
    const amountMinor = parseRupeesToMinor(amountRs, 'amountRs', false);
    return this.finesService.recordPayment(
      Number(fineId),
      amountMinor,
      staff?.sub ?? 1,
      note?.trim(),
    );
  }

  // -------------------------------------------------------------
  // ADMIN-ONLY MUTATION
  // -------------------------------------------------------------

  /**
   * waiveFine: Waives an unpaid or partially paid fine.
   * Reason is required. Subject to staff throttler limit (20 req/min).
   */
  @Mutation(() => FineModel, { name: 'waiveFine' })
  @Roles(Role.ADMIN)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async waiveFine(
    @Args('fineId', { type: () => ID }) fineId: number,
    @Args('reason', { type: () => String }) reason: string,
    @CurrentUser() admin?: AuthenticatedUser,
  ): Promise<Fine> {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('Waiver reason is required.');
    }

    return this.finesService.waiveFine(
      Number(fineId),
      reason.trim(),
      admin?.sub ?? 1,
    );
  }

  // -------------------------------------------------------------
  // STAFF QUERIES (LIBRARIAN and ADMIN)
  // -------------------------------------------------------------

  /**
   * memberFines: Staff query to look up all fines for a member by email.
   */
  @Query(() => [FineModel], { name: 'memberFines' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async memberFines(
    @Args('memberEmail', { type: () => String }) memberEmail: string,
    @Args('status', { type: () => FineStatus, nullable: true })
    status?: FineStatus,
  ): Promise<Fine[]> {
    const member = await this.identityPublicApi.findMemberByEmail(
      memberEmail.trim(),
    );
    if (!member) {
      throw new MemberNotFoundError(memberEmail.trim());
    }

    const { fines } = await this.finesService.getMemberFines(member.id, status);
    return fines;
  }

  /**
   * fines: Staff query with filters and pagination.
   */
  @Query(() => [FineModel], { name: 'fines' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async fines(
    @Args('filter', { type: () => FineFilterInput, nullable: true })
    filter?: FineFilterInput,
    @Args('pagination', { type: () => FinePaginationInput, nullable: true })
    pagination?: FinePaginationInput,
  ): Promise<Fine[]> {
    const { items } = await this.finesService.listFines(filter, pagination);
    return items;
  }

  /**
   * fine: Staff query to inspect a single fine with payment ledger entries.
   */
  @Query(() => FineModel, { name: 'fine' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async fine(@Args('id', { type: () => ID }) id: number): Promise<Fine> {
    return this.finesService.getFine(Number(id));
  }

  // -------------------------------------------------------------
  // MEMBER QUERIES
  // -------------------------------------------------------------

  /**
   * myFines: Retrieves fines for the currently authenticated member.
   * Completely redacts staff details, barcodes, and other patrons' data.
   */
  @Query(() => [MyFineModel], { name: 'myFines' })
  async myFines(
    @CurrentUser() user: AuthenticatedUser,
    @Args('status', { type: () => FineStatus, nullable: true })
    status?: FineStatus,
  ): Promise<MyFineModel[]> {
    const { fines } = await this.finesService.getMemberFines(user.sub, status);

    return fines.map((f) => ({
      id: f.id,
      reason: f.reason,
      originalAmountRs: minorToRs(f.amountMinor),
      amountRs: minorToRs(f.amountMinor),
      paidAmountRs: minorToRs(f.paidMinor),
      paidRs: minorToRs(f.paidMinor),
      outstandingAmountRs: minorToRs(f.amountMinor - f.paidMinor),
      outstandingRs: minorToRs(f.amountMinor - f.paidMinor),
      status: f.status,
      loanId: f.loanId,
      createdAt: f.createdAt,
      uncappedAmountRs:
        f.uncappedAmountMinor !== null && f.uncappedAmountMinor !== undefined
          ? minorToRs(f.uncappedAmountMinor)
          : null,
      capRs:
        f.capMinor !== null && f.capMinor !== undefined
          ? minorToRs(f.capMinor)
          : null,
      wasCapped: f.amountMinor < (f.uncappedAmountMinor ?? f.amountMinor),
    }));
  }

  // -------------------------------------------------------------
  // FIELD RESOLVERS ON FineModel
  // -------------------------------------------------------------

  @ResolveField(() => [FinePaymentModel], { name: 'payments' })
  async resolvePayments(
    @Parent() fine: Fine & { payments?: FinePayment[] },
  ): Promise<FinePaymentModel[]> {
    const payments =
      fine.payments ??
      (await this.prisma.finePayment.findMany({
        where: { fineId: fine.id },
        orderBy: { createdAt: 'asc' },
      }));

    return payments.map((p) => ({
      id: p.id,
      fineId: p.fineId,
      amountMinor: p.amountMinor,
      amountRs: minorToRs(p.amountMinor),
      receivedById: p.receivedById,
      note: p.note,
      createdAt: p.createdAt,
    }));
  }

  @ResolveField(() => Float, { name: 'amountRs' })
  resolveAmountRs(@Parent() fine: Fine): number {
    return minorToRs(fine.amountMinor);
  }

  @ResolveField(() => Float, { name: 'paidRs' })
  resolvePaidRs(@Parent() fine: Fine): number {
    return minorToRs(fine.paidMinor);
  }

  @ResolveField(() => Int, { name: 'outstandingMinor' })
  resolveOutstandingMinor(@Parent() fine: Fine): number {
    return fine.amountMinor - fine.paidMinor;
  }

  @ResolveField(() => Float, { name: 'outstandingRs' })
  resolveOutstandingRs(@Parent() fine: Fine): number {
    return minorToRs(fine.amountMinor - fine.paidMinor);
  }

  @ResolveField(() => Float, { name: 'uncappedAmountRs', nullable: true })
  resolveUncappedAmountRs(@Parent() fine: Fine): number | null {
    return fine.uncappedAmountMinor !== null &&
      fine.uncappedAmountMinor !== undefined
      ? minorToRs(fine.uncappedAmountMinor)
      : null;
  }

  @ResolveField(() => Float, { name: 'capRs', nullable: true })
  resolveCapRs(@Parent() fine: Fine): number | null {
    return fine.capMinor !== null && fine.capMinor !== undefined
      ? minorToRs(fine.capMinor)
      : null;
  }

  @ResolveField(() => Boolean, { name: 'wasCapped' })
  resolveWasCapped(@Parent() fine: Fine): boolean {
    return fine.amountMinor < (fine.uncappedAmountMinor ?? fine.amountMinor);
  }
}

@Resolver(() => MyFineModel)
export class MyFineModelResolver {
  constructor(private readonly finesDataLoader: FinesDataLoader) {}

  /**
   * bookTitle: Batched resolution of related book title via Catalog DataLoader.
   * If fine is not associated with a loan, resolves to null without database queries.
   */
  @ResolveField(() => String, { name: 'bookTitle', nullable: true })
  async resolveBookTitle(@Parent() fine: MyFineModel): Promise<string | null> {
    return this.finesDataLoader.loadBookTitleForLoan(fine.loanId);
  }
}
