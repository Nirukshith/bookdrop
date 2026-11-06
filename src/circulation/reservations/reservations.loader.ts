import { Inject, Injectable, Scope } from '@nestjs/common';
import * as DataLoader from 'dataloader';
import { ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { BooksService, BookModel } from '../../books';
import { IDENTITY_PUBLIC_API, IdentityPublicApi, MemberDto } from '../../users';

@Injectable({ scope: Scope.REQUEST })
export class ReservationsDataLoader {
  private readonly queueLengthLoader: DataLoader<number, number>;
  private readonly bookLoader: DataLoader<number, BookModel | null>;
  private readonly userLoader: DataLoader<number, MemberDto | null>;
  private readonly holdLoader: DataLoader<number, any | null>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly booksService: BooksService,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityPublicApi: IdentityPublicApi,
  ) {
    this.queueLengthLoader = new DataLoader<number, number>(
      async (bookIds: readonly number[]) => {
        const counts = await this.prisma.reservation.groupBy({
          by: ['bookId'],
          where: {
            bookId: { in: [...bookIds] },
            status: ReservationStatus.WAITING,
          },
          _count: { _all: true },
        });

        const map = new Map<number, number>();
        for (const row of counts) {
          map.set(row.bookId, row._count._all);
        }

        return bookIds.map((id) => map.get(id) ?? 0);
      },
      { cache: true },
    );

    this.bookLoader = new DataLoader<number, BookModel | null>(
      async (bookIds: readonly number[]) => {
        const books = await this.prisma.book.findMany({
          where: { id: { in: [...bookIds] } },
          include: { authors: true, categories: true },
        });
        const map = new Map<number, BookModel>();
        for (const b of books) {
          map.set(b.id, b as any);
        }
        return bookIds.map((id) => map.get(id) ?? null);
      },
      { cache: true },
    );

    this.userLoader = new DataLoader<number, MemberDto | null>(
      async (userIds: readonly number[]) => {
        const members = await this.identityPublicApi.getMembersByIds([
          ...userIds,
        ]);
        const map = new Map<number, MemberDto>();
        for (const m of members) {
          map.set(m.id, m);
        }
        return userIds.map((id) => map.get(id) ?? null);
      },
      { cache: true },
    );

    this.holdLoader = new DataLoader<number, any | null>(
      async (holdIds: readonly number[]) => {
        const holds = await this.prisma.hold.findMany({
          where: { id: { in: [...holdIds] } },
          include: { copy: true },
        });
        const map = new Map<number, any>();
        for (const h of holds) {
          map.set(h.id, h);
        }
        return holdIds.map((id) => map.get(id) ?? null);
      },
      { cache: true },
    );
  }

  loadQueueLength(bookId: number): Promise<number> {
    return this.queueLengthLoader.load(bookId);
  }

  loadBook(bookId: number): Promise<BookModel | null> {
    return this.bookLoader.load(bookId);
  }

  loadUser(userId: number): Promise<MemberDto | null> {
    return this.userLoader.load(userId);
  }

  loadHold(holdId: number): Promise<any | null> {
    return this.holdLoader.load(holdId);
  }
}
