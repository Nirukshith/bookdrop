import { UseGuards } from '@nestjs/common';
import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { CopyStatus, Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Roles, RolesGuard } from '../../auth';
import { CopiesService } from './copies.service';
import { AddCopyInput } from './dto/add-copy.input';
import { CopiesFilterArgs } from './dto/copies-filter.args';
import { UpdateCopyInput } from './dto/update-copy.input';
import { CopyStatusHistoryModel } from './models/copy-status-history.model';
import { CopyModel } from './models/copy.model';

@Resolver(() => CopyModel)
@UseGuards(RolesGuard)
@Roles(Role.LIBRARIAN, Role.ADMIN)
export class CopiesResolver {
  constructor(private readonly copiesService: CopiesService) {}

  @Mutation(() => CopyModel, { name: 'addCopy' })
  async addCopy(
    @Args('input') input: AddCopyInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CopyModel> {
    return this.copiesService.addCopy(
      input.bookId,
      input.barcode,
      input.shelfLocation,
      input.notes,
      user?.sub,
    );
  }

  @Mutation(() => [CopyModel], { name: 'addCopies' })
  async addCopies(
    @Args('bookId', { type: () => Int }) bookId: number,
    @Args('quantity', { type: () => Int }) quantity: number,
    @Args('shelfLocation', { type: () => String, nullable: true })
    shelfLocation: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CopyModel[]> {
    return this.copiesService.addCopies(
      bookId,
      quantity,
      shelfLocation,
      user?.sub,
    );
  }

  @Mutation(() => CopyModel, { name: 'updateCopy' })
  async updateCopy(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateCopyInput,
  ): Promise<CopyModel> {
    return this.copiesService.updateCopy(id, input.shelfLocation, input.notes);
  }

  @Mutation(() => CopyModel, { name: 'changeCopyStatus' })
  async changeCopyStatus(
    @Args('id', { type: () => Int }) id: number,
    @Args('to', { type: () => CopyStatus }) to: CopyStatus,
    @Args('reason', { type: () => String, nullable: true })
    reason: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CopyModel> {
    return this.copiesService.changeStatus(id, to, reason, user?.sub);
  }

  @Mutation(() => CopyModel, { name: 'retireCopy' })
  async retireCopy(
    @Args('id', { type: () => Int }) id: number,
    @Args('reason', { type: () => String, nullable: true })
    reason: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<CopyModel> {
    return this.copiesService.retireCopy(id, reason, user?.sub);
  }

  @Query(() => [CopyModel], { name: 'copies' })
  async getCopies(@Args() filter: CopiesFilterArgs): Promise<CopyModel[]> {
    return this.copiesService.listCopies(filter);
  }

  @Query(() => CopyModel, { name: 'copy' })
  async getCopy(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<CopyModel> {
    return this.copiesService.findById(id);
  }

  @Query(() => CopyModel, { name: 'copyByBarcode' })
  async getCopyByBarcode(@Args('barcode') barcode: string): Promise<CopyModel> {
    return this.copiesService.findByBarcode(barcode);
  }

  @Query(() => [CopyStatusHistoryModel], { name: 'copyStatusHistory' })
  async getCopyStatusHistory(
    @Args('copyId', { type: () => Int }) copyId: number,
  ): Promise<CopyStatusHistoryModel[]> {
    return this.copiesService.getStatusHistory(copyId);
  }
}
