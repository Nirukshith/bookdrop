import { Injectable, Scope } from '@nestjs/common';
import * as DataLoader from 'dataloader';
import { PrismaService } from '../../prisma/prisma.service';
import { BooksService } from '../../books';

@Injectable({ scope: Scope.REQUEST })
export class FinesDataLoader {
  private readonly bookTitleByLoanIdLoader: DataLoader<number, string | null>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly booksService: BooksService,
  ) {
    this.bookTitleByLoanIdLoader = new DataLoader<number, string | null>(
      async (loanIds: readonly number[]) => {
        if (!loanIds || loanIds.length === 0) {
          return [];
        }

        const uniqueLoanIds = Array.from(new Set(loanIds));

        // Batch query loans in ONE database query
        const loans = await this.prisma.loan.findMany({
          where: { id: { in: uniqueLoanIds } },
          select: { id: true, bookId: true },
        });

        const loanToBookMap = new Map<number, number>();
        for (const loan of loans) {
          loanToBookMap.set(loan.id, loan.bookId);
        }

        const uniqueBookIds = Array.from(
          new Set(loans.map((loan) => loan.bookId)),
        );

        // Batch resolve book titles through Catalog public interface in ONE batch call
        const titlesMap =
          await this.booksService.findTitlesByIds(uniqueBookIds);

        return loanIds.map((loanId) => {
          const bookId = loanToBookMap.get(loanId);
          if (bookId === undefined) {
            return null;
          }
          return titlesMap.get(bookId) ?? null;
        });
      },
      { cache: true },
    );
  }

  /**
   * Resolves the book title for a given loan ID via batched DataLoader.
   * If loanId is null/undefined or loan has no book, returns null.
   */
  async loadBookTitleForLoan(
    loanId: number | null | undefined,
  ): Promise<string | null> {
    if (!loanId) {
      return null;
    }
    return this.bookTitleByLoanIdLoader.load(loanId);
  }
}
