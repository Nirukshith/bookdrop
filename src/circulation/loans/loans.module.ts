import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../../prisma/prisma.module';
import { CopiesModule } from '../copies/copies.module';
import { HoldsModule } from '../holds/holds.module';
import { UsersModule } from '../../users';
import { LoansService } from './loans.service';
import { LOANS_PUBLIC_API } from './loans-public-api.interface';

@Module({
  imports: [PrismaModule, ConfigModule, CopiesModule, HoldsModule, UsersModule],
  providers: [
    LoansService,
    {
      provide: LOANS_PUBLIC_API,
      useExisting: LoansService,
    },
  ],
  exports: [LoansService, LOANS_PUBLIC_API],
})
export class LoansModule {}
