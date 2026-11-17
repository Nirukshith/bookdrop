import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BooksModule } from '../../books';
import { UsersModule } from '../../users';
import { CopiesModule } from '../copies/copies.module';
import { FinesModule } from '../fines/fines.module';
import { ClockModule } from '../../common/clock/clock.module';
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
import {
  MissedPickupsResolver,
  RecentMissedPickupResolver,
} from './missed-pickups.resolver';
import { MissedPickupsDataLoader } from './missed-pickups.loader';

@Module({
  imports: [
    PrismaModule,
    BooksModule,
    UsersModule,
    forwardRef(() => CopiesModule),
    forwardRef(() => FinesModule),
    ClockModule,
  ],
  providers: [
    HoldsService,
    HoldsResolver,
    HoldsDataLoader,
    MissedPickupsResolver,
    RecentMissedPickupResolver,
    MissedPickupsDataLoader,
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
    MissedPickupsDataLoader,
  ],
})
export class HoldsModule {}
