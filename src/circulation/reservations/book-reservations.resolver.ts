import { Int, Parent, ResolveField, Resolver } from '@nestjs/graphql';
import { Public } from '../../auth';
import { BookModel } from '../../books';
import { ReservationsDataLoader } from './reservations.loader';

@Resolver(() => BookModel)
export class BookReservationsResolver {
  constructor(
    private readonly reservationsDataLoader: ReservationsDataLoader,
  ) {}

  @Public()
  @ResolveField(() => Int, {
    name: 'queueLength',
    description: 'Count of active WAITING reservations for this book',
  })
  async queueLength(@Parent() book: BookModel): Promise<number> {
    return this.reservationsDataLoader.loadQueueLength(Number(book.id));
  }
}
