import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { BooksModule } from '../../books';
import { ClockModule } from '../../common/clock/clock.module';
import { ReservationsService } from './reservations.service';
import { UNPAID_FINES_PORT, DefaultUnpaidFinesAdapter } from '../holds/ports';

@Module({
  imports: [PrismaModule, BooksModule, ClockModule],
  providers: [
    ReservationsService,
    DefaultUnpaidFinesAdapter,
    {
      provide: UNPAID_FINES_PORT,
      useClass: DefaultUnpaidFinesAdapter,
    },
  ],
  exports: [ReservationsService],
})
export class ReservationsModule {}
