import { Module } from '@nestjs/common';
import { UsersResolver } from './users.resolver';
import { UsersService } from './users.service';
import { IDENTITY_PUBLIC_API } from './identity-public-api.interface';

const isStandaloneIdentity = process.env.IDENTITY_SERVICE_STANDALONE === 'true';

@Module({
  providers: [
    UsersService,
    {
      provide: IDENTITY_PUBLIC_API,
      useExisting: UsersService,
    },
    ...(isStandaloneIdentity ? [] : [UsersResolver]),
  ],
  exports: [UsersService, IDENTITY_PUBLIC_API],
})
export class UsersModule {}
