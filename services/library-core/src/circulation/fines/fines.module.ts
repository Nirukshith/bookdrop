import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ClockModule } from '../../common/clock/clock.module';
import { BooksModule } from '../../books';
import { UsersModule } from '../../users';
import { FinesService } from './fines.service';
import { FINES_PUBLIC_API } from './fines-public-api.interface';
import { FinesResolver, MyFineModelResolver } from './fines.resolver';
import { FinesDataLoader } from './fines.loader';

@Module({
  imports: [PrismaModule, ClockModule, BooksModule, UsersModule],
  providers: [
    FinesService,
    FinesResolver,
    MyFineModelResolver,
    FinesDataLoader,
    {
      provide: FINES_PUBLIC_API,
      useExisting: FinesService,
    },
  ],
  exports: [FinesService, FINES_PUBLIC_API, FinesDataLoader],
})
export class FinesModule {}
