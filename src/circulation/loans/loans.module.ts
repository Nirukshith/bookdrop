import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { BooksModule } from '../../books';
import { CopiesModule } from '../copies/copies.module';
import { HoldsModule } from '../holds/holds.module';
import { UsersModule } from '../../users';
import { LoansService } from './loans.service';
import { LoansResolver } from './loans.resolver';
import { LoansDataLoader } from './loans.loader';
import { LOANS_PUBLIC_API } from './loans-public-api.interface';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    BooksModule,
    CopiesModule,
    HoldsModule,
    UsersModule,
  ],
  providers: [
    LoansService,
    LoansResolver,
    LoansDataLoader,
    {
      provide: LOANS_PUBLIC_API,
      useExisting: LoansService,
    },
  ],
  exports: [LoansService, LOANS_PUBLIC_API, LoansDataLoader],
})
export class LoansModule {}
