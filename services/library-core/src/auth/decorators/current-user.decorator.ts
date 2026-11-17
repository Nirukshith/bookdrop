import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';

export interface AuthenticatedUser {
  sub: number;
  email: string;
  role: string;
}

export const CurrentUser = createParamDecorator(
  (data: unknown, context: ExecutionContext): AuthenticatedUser => {
    let req: any;
    if (context.getType<string>() === 'graphql') {
      const ctx = GqlExecutionContext.create(context);
      req = ctx.getContext()?.req;
    } else {
      req = context.switchToHttp().getRequest();
    }
    return req?.user;
  },
);
