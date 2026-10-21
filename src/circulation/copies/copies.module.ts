import { Module } from '@nestjs/common';
import { BooksModule } from '../../books';
import { PrismaModule } from '../../prisma/prisma.module';
import { CopiesService } from './copies.service';

@Module({
  imports: [PrismaModule, BooksModule],
  providers: [CopiesService],
  exports: [CopiesService],
})
export class CopiesModule {}
