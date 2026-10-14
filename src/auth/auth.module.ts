import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthResolver } from './auth.resolver';
import { AuthService } from './auth.service';

@Module({
  imports: [
    UsersModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_ACCESS_TTL', '15m'),
        },
      }),
    }),
  ],
  providers: [AuthService, AuthResolver], // NestJS instantiates and manages AuthService and AuthResolver here
  exports: [AuthService, JwtModule], // Makes AuthService and JwtModule available to other modules that import this one
})
export class AuthModule { }
