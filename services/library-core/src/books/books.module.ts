import { Module } from '@nestjs/common';
import { BooksResolver } from './books.resolver';
import { BooksService } from './books.service';
import { CATALOG_PUBLIC_API } from './catalog-public-api.interface';

@Module({
  providers: [
    BooksResolver,
    BooksService,
    {
      provide: CATALOG_PUBLIC_API,
      useExisting: BooksService,
    },
  ],
  exports: [BooksService, CATALOG_PUBLIC_API],
})
export class BooksModule {}
