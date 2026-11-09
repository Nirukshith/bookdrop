import {
  Args,
  Float,
  Int,
  Mutation,
  Parent,
  Query,
  ResolveField,
  ResolveReference,
  Resolver,
} from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { AuthenticatedUser, CurrentUser, Public, Roles } from '../auth';
import { BooksService } from './books.service';
import { CreateBookInput } from './dto/create-book.input';
import { GetBooksArgs } from './dto/get-books.args';
import { UpdateBookInput } from './dto/update-book.input';
import { BookModel } from './models/book.model';

@Resolver(() => BookModel)
export class BooksResolver {
  constructor(private readonly booksService: BooksService) {}

  @ResolveReference()
  async resolveReference(reference: {
    __typename: string;
    id: number | string;
  }): Promise<BookModel | null> {
    return this.booksService.findById(Number(reference.id));
  }

  @Public()
  @Query(() => [BookModel], { name: 'books' })
  async getBooks(@Args() args: GetBooksArgs): Promise<BookModel[]> {
    return this.booksService.findAll(args);
  }

  @Public()
  @Query(() => BookModel, { name: 'book', nullable: true })
  async getBook(
    @Args('id', { type: () => Int }) id: number,
  ): Promise<BookModel | null> {
    return this.booksService.findById(id);
  }

  @Mutation(() => BookModel, { name: 'createBook' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async createBook(
    @Args('input') input: CreateBookInput,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<BookModel> {
    return this.booksService.create(input, user?.sub ?? null);
  }

  @Mutation(() => BookModel, { name: 'updateBook' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async updateBook(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateBookInput,
    @CurrentUser() user?: AuthenticatedUser,
  ): Promise<BookModel> {
    return this.booksService.update(id, input, user?.sub ?? null);
  }

  @ResolveField(() => Float, {
    nullable: true,
    description: 'Replacement price in Rupees (null if not set)',
  })
  replacementPriceRs(@Parent() book: BookModel): number | null {
    if (book.replacementPriceRs !== undefined) {
      return book.replacementPriceRs;
    }
    if (book.priceMinor !== undefined && book.priceMinor !== null) {
      return book.priceMinor / 100;
    }
    return null;
  }
}
