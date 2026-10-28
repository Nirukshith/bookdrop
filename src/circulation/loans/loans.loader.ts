import { Inject, Injectable, Scope } from '@nestjs/common';
import * as DataLoader from 'dataloader';
import { BooksService } from '../../books';
import { IDENTITY_PUBLIC_API, IdentityPublicApi } from '../../users';

@Injectable({ scope: Scope.REQUEST })
export class LoansDataLoader {
  private readonly bookTitleLoader: DataLoader<number, string>;
  private readonly memberNameLoader: DataLoader<number, string>;

  constructor(
    private readonly booksService: BooksService,
    @Inject(IDENTITY_PUBLIC_API)
    private readonly identityPublicApi: IdentityPublicApi,
  ) {
    this.bookTitleLoader = new DataLoader<number, string>(
      async (bookIds: readonly number[]) => {
        const titlesMap = await this.booksService.findTitlesByIds([...bookIds]);
        return bookIds.map((id) => titlesMap.get(id) ?? 'Unknown Title');
      },
      { cache: true },
    );

    this.memberNameLoader = new DataLoader<number, string>(
      async (userIds: readonly number[]) => {
        const members = await this.identityPublicApi.getMembersByIds([
          ...userIds,
        ]);
        const membersMap = new Map<number, string>(
          members.map((m) => [m.id, m.name]),
        );
        return userIds.map((id) => membersMap.get(id) ?? 'Unknown Member');
      },
      { cache: true },
    );
  }

  loadBookTitle(bookId: number): Promise<string> {
    return this.bookTitleLoader.load(bookId);
  }

  loadMemberName(userId: number): Promise<string> {
    return this.memberNameLoader.load(userId);
  }
}
