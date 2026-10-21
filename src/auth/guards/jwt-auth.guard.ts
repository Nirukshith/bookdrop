import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { GqlExecutionContext } from '@nestjs/graphql';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      const req = this.getRequest(context);
      const authHeader = req?.headers?.authorization;
      if (authHeader) {
        const [bearer, token] = authHeader.split(' ');
        if (bearer === 'Bearer' && token) {
          try {
            const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
            const payload = await this.jwtService.verifyAsync(token, {
              secret,
            });
            req.user = payload;
          } catch {
            // Optional auth on public route: ignore invalid token
          }
        }
      }
      return true;
    }

    const req = this.getRequest(context);
    const authHeader = req?.headers?.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authentication token missing');
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid token format');
    }

    try {
      const secret = this.configService.get<string>('JWT_ACCESS_SECRET');
      const payload = await this.jwtService.verifyAsync(token, { secret });
      req.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private getRequest(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      return ctx.getContext()?.req;
    }
    return context.switchToHttp().getRequest();
  }
}
