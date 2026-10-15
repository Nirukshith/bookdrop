import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { BooksService } from './books.service';
import { CreateBookInput } from './dto/create-book.input';
import { GetBooksArgs } from './dto/get-books.args';
import { UpdateBookInput } from './dto/update-book.input';
import { BookModel } from './models/book.model';

@Resolver(() => BookModel)
export class BooksResolver {
  constructor(private readonly booksService: BooksService) {}

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
  async createBook(@Args('input') input: CreateBookInput): Promise<BookModel> {
    return this.booksService.create(input);
  }

  @Mutation(() => BookModel, { name: 'updateBook' })
  @Roles(Role.LIBRARIAN, Role.ADMIN)
  async updateBook(
    @Args('id', { type: () => Int }) id: number,
    @Args('input') input: UpdateBookInput,
  ): Promise<BookModel> {
    return this.booksService.update(id, input);
  }
}
