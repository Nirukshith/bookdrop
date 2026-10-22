import { Injectable, Scope } from '@nestjs/common';
import * as DataLoader from 'dataloader';
import { BooksService } from '../../books';

@Injectable({ scope: Scope.REQUEST })
export class HoldsDataLoader {
  private readonly bookTitleLoader: DataLoader<number, string>;

  constructor(private readonly booksService: BooksService) {
    this.bookTitleLoader = new DataLoader<number, string>(
      async (bookIds: readonly number[]) => {
        const titlesMap = await this.booksService.findTitlesByIds([...bookIds]);
        return bookIds.map((id) => titlesMap.get(id) ?? 'Unknown Title');
      },
      { cache: true },
    );
  }

  loadBookTitle(bookId: number): Promise<string> {
    return this.bookTitleLoader.load(bookId);
  }
}
