import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BooksModule } from '../../books';
import { CopiesModule } from '../copies/copies.module';
import { HoldsService } from './holds.service';
import { MemberEligibilityPolicy } from './member-eligibility.policy';
import {
  ACTIVE_LOAN_COUNT_PORT,
  UNPAID_FINES_PORT,
  DefaultActiveLoanCountAdapter,
  DefaultUnpaidFinesAdapter,
} from './ports';
import { HOLDS_PUBLIC_API } from './holds-public-api.interface';

import { HoldsResolver } from './holds.resolver';
import { HoldsDataLoader } from './holds.loader';

@Module({
  imports: [PrismaModule, BooksModule, CopiesModule],
  providers: [
    HoldsService,
    HoldsResolver,
    HoldsDataLoader,
    MemberEligibilityPolicy,
    {
      provide: ACTIVE_LOAN_COUNT_PORT,
      useClass: DefaultActiveLoanCountAdapter,
    },
    {
      provide: UNPAID_FINES_PORT,
      useClass: DefaultUnpaidFinesAdapter,
    },
    {
      provide: HOLDS_PUBLIC_API,
      useExisting: HoldsService,
    },
  ],
  exports: [
    HoldsService,
    HOLDS_PUBLIC_API,
    MemberEligibilityPolicy,
    HoldsDataLoader,
  ],
})
export class HoldsModule {}
