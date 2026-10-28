import { Module } from '@nestjs/common';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';
import { IDENTITY_PUBLIC_API } from './identity-public-api.interface';

@Module({
  providers: [
    UsersService,
    UsersResolver,
    {
      provide: IDENTITY_PUBLIC_API,
      useExisting: UsersService,
    },
  ],
  exports: [UsersService, IDENTITY_PUBLIC_API],
})
export class UsersModule {}
