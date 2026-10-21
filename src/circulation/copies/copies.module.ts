import { Module } from '@nestjs/common';
import { BooksModule } from '../../books';
import { PrismaModule } from '../../prisma/prisma.module';
import { BookCopiesResolver } from './book-copies.resolver';
import { CopiesDataLoader } from './copies.loader';
import { CopiesResolver } from './copies.resolver';
import { CopiesService } from './copies.service';

@Module({
  imports: [PrismaModule, BooksModule],
  providers: [
    CopiesService,
    CopiesDataLoader,
    BookCopiesResolver,
    CopiesResolver,
  ],
  exports: [CopiesService, CopiesDataLoader],
})
export class CopiesModule {}
