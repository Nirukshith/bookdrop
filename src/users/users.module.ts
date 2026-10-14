import { Module } from '@nestjs/common';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService], // NestJS instantiates and manages UsersService here
  exports: [UsersService], // Makes UsersService available to other modules that import this one
})
export class UsersModule { }
