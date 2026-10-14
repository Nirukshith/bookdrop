import { Args, Int, Query, Resolver } from '@nestjs/graphql';
import { Public } from '../auth/decorators/public.decorator';
import { BooksService } from './books.service';
import { GetBooksArgs } from './dto/get-books.args';
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
}
