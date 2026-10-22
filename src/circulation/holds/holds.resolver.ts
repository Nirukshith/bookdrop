import { UseGuards } from '@nestjs/common';
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
import { Hold, HoldStatus, Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles, RolesGuard } from '../../auth';
import { CopiesService } from '../copies/copies.service';
import { HoldsService } from './holds.service';
import { HoldsDataLoader } from './holds.loader';
import { HoldModel } from './models/hold.model';
import { HoldFilterInput, HoldsPaginationInput } from './dto/hold-filter.input';

@Resolver(() => HoldModel)
@UseGuards(RolesGuard)
export class HoldsResolver {
  constructor(
    private readonly holdsService: HoldsService,
    private readonly copiesService: CopiesService,
    private readonly holdsDataLoader: HoldsDataLoader,
  ) {}

  // -------------------------------------------------------------
  // MEMBER MUTATIONS & QUERIES
  // -------------------------------------------------------------

  /**
   * requestHold: Allows an authenticated member to reserve an available physical copy.
   * Subject to strict rate-limiting (5 requests per minute per authenticated user).
   */
  @Mutation(() => HoldModel, { name: 'requestHold' })
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async requestHold(
    @Args('bookId', { type: () => Int }) bookId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Hold> {
    return this.holdsService.requestHold(user.sub, bookId);
  }

  /**
   * cancelMyHold: Allows a member to cancel their own active hold.
   */
  @Mutation(() => HoldModel, { name: 'cancelMyHold' })
  async cancelMyHold(
    @Args('holdId', { type: () => Int }) holdId: number,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Hold> {
    return this.holdsService.cancelHold(holdId, {
      id: user.sub,
      role: user.role,
    });
  }

  /**
   * myHolds: Returns holds for the authenticated member.
   * Copy barcodes are redacted from member payloads via field-level resolver authorization.
   */
  @Query(() => [HoldModel], { name: 'myHolds' })
  async myHolds(
    @CurrentUser() user: AuthenticatedUser,
    @Args('status', { type: () => HoldStatus, nullable: true })
    status?: HoldStatus,
  ): Promise<Hold[]> {
    return this.holdsService.listMemberHolds(user.sub, status);
  }

  // -------------------------------------------------------------
  // STAFF MUTATIONS & QUERIES (LIBRARIAN and ADMIN only)
  // -------------------------------------------------------------

  /**
   * cancelHold: Staff cancellation of any hold with an audit reason.
   */
  @Mutation(() => HoldModel, { name: 'cancelHold' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async cancelHold(
    @Args('holdId', { type: () => Int }) holdId: number,
    @Args('reason', { type: () => String, nullable: true })
    reason: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Hold> {
    return this.holdsService.cancelHold(
      holdId,
      { id: user.sub, role: user.role },
      reason,
    );
  }

  /**
   * holds: Staff lookup for holds with status/user/book/deadline filters and pagination.
   */
  @Query(() => [HoldModel], { name: 'holds' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async getHolds(
    @Args('filter', { type: () => HoldFilterInput, nullable: true })
    filter?: HoldFilterInput,
    @Args('pagination', { type: () => HoldsPaginationInput, nullable: true })
    pagination?: HoldsPaginationInput,
  ): Promise<Hold[]> {
    const { items } = await this.holdsService.listHolds(filter, pagination);
    return items;
  }

  /**
   * hold: Staff lookup for a single hold by its ID (includes barcode for the pickup desk).
   */
  @Query(() => HoldModel, { name: 'hold' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async getHold(@Args('id', { type: () => Int }) id: number): Promise<Hold> {
    return this.holdsService.getHold(id);
  }

  // -------------------------------------------------------------
  // FIELD RESOLVERS
  // -------------------------------------------------------------

  /**
   * bookTitle: Resolves book title via Catalog DataLoader (single batched query across all holds).
   */
  @ResolveField(() => String, { name: 'bookTitle' })
  async resolveBookTitle(@Parent() hold: Hold): Promise<string> {
    return this.holdsDataLoader.loadBookTitle(hold.bookId);
  }

  /**
   * copyBarcode: Staff-only field.
   * If requested by a MEMBER, returns null to prevent barcode leakage.
   * If requested by LIBRARIAN or ADMIN, returns the physical copy's barcode.
   */
  @ResolveField(() => String, { name: 'copyBarcode', nullable: true })
  async resolveCopyBarcode(
    @Parent() hold: Hold & { copy?: { barcode: string } },
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<string | null> {
    if (!user || user.role === Role.MEMBER) {
      return null;
    }

    if (hold.copy?.barcode) {
      return hold.copy.barcode;
    }

    try {
      const copy = await this.copiesService.findById(hold.copyId);
      return copy.barcode;
    } catch {
      return null;
    }
  }
}
