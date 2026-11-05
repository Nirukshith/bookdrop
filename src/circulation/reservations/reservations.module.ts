import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BooksModule } from '../../books';
import { ClockModule } from '../../common/clock/clock.module';
import { HoldsModule } from '../holds/holds.module';
import { CopiesModule } from '../copies/copies.module';
import { UsersModule } from '../../users/users.module';
import { ReservationsService } from './reservations.service';
import { PromotionService } from './promotion.service';
import { ReservationsResolver } from './reservations.resolver';
import { BookReservationsResolver } from './book-reservations.resolver';
import { ReservationsDataLoader } from './reservations.loader';
import { COPY_AVAILABILITY_LISTENER } from '../copies/ports';
import { UNPAID_FINES_PORT, DefaultUnpaidFinesAdapter } from '../holds/ports';

@Module({
  imports: [
    PrismaModule,
    BooksModule,
    ClockModule,
    forwardRef(() => HoldsModule),
    UsersModule,
    forwardRef(() => CopiesModule),
  ],
  providers: [
    ReservationsService,
    PromotionService,
    ReservationsResolver,
    BookReservationsResolver,
    ReservationsDataLoader,
    DefaultUnpaidFinesAdapter,
    {
      provide: UNPAID_FINES_PORT,
      useClass: DefaultUnpaidFinesAdapter,
    },
    {
      provide: COPY_AVAILABILITY_LISTENER,
      useExisting: PromotionService,
    },
  ],
  exports: [ReservationsService, PromotionService, COPY_AVAILABILITY_LISTENER],
})
export class ReservationsModule {}
