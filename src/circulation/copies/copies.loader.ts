import { Injectable, Scope } from '@nestjs/common';
import * as DataLoader from 'dataloader';
import { CopiesService } from './copies.service';

@Injectable({ scope: Scope.REQUEST })
export class CopiesDataLoader {
  private readonly availableCopiesLoader: DataLoader<number, number>;

  constructor(private readonly copiesService: CopiesService) {
    this.availableCopiesLoader = new DataLoader<number, number>(
      async (bookIds: readonly number[]) => {
        const countsMap = await this.copiesService.availableCountsForBooks([
          ...bookIds,
        ]);
        return bookIds.map((id) => countsMap.get(id) ?? 0);
      },
      { cache: true },
    );
  }

  loadAvailableCount(bookId: number): Promise<number> {
    return this.availableCopiesLoader.load(bookId);
  }
}
