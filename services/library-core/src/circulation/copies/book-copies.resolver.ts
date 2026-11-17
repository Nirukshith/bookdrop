import { UseGuards } from '@nestjs/common';
import { Int, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { Public, Roles, RolesGuard } from '../../auth';
import { BookModel } from '../../books';
import { CopiesDataLoader } from './copies.loader';
import { CopiesService } from './copies.service';
import { CopyCountsModel } from './models/copy-counts.model';

@Resolver(() => BookModel)
export class BookCopiesResolver {
  constructor(
    private readonly copiesDataLoader: CopiesDataLoader,
    private readonly copiesService: CopiesService,
  ) {}

  /**
   * Public field: Batched count of available, non-retired copies using DataLoader.
   * Eliminates the N+1 problem (20 books execute 1 batched copy-count query).
   */
  @Public()
  @ResolveField(() => Int, { name: 'availableCopies' })
  async availableCopies(@Parent() book: BookModel): Promise<number> {
    return this.copiesDataLoader.loadAvailableCount(Number(book.id));
  }

  /**
   * Public field backward-compatibility alias for availableCopies.
   */
  @Public()
  @ResolveField(() => Int, { name: 'availableCopiesCount' })
  async availableCopiesCount(@Parent() book: BookModel): Promise<number> {
    return this.copiesDataLoader.loadAvailableCount(Number(book.id));
  }

  /**
   * Staff only (LIBRARIAN and ADMIN): Full status breakdown for the book.
   * Unauthorized members querying this field receive a 403 Forbidden error.
   */
  @UseGuards(RolesGuard)
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  @ResolveField(() => CopyCountsModel, { name: 'copyCounts' })
  async copyCounts(@Parent() book: BookModel): Promise<CopyCountsModel> {
    return this.copiesService.copyCountsForBook(Number(book.id));
  }
}
