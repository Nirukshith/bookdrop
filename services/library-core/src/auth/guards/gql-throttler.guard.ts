import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

const ROOT_OPERATION_TYPES = new Set(['Query', 'Mutation', 'Subscription']);

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
  /**
   * `fieldResolverEnhancers: ['guards']` runs global guards on every field
   * resolver too. Without this check, a single `books` query would consume
   * one throttle slot per book per resolved field, so a member loading the
   * catalog a few times a minute would be rate limited. Only root
   * operations count towards the limit.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType<string>() === 'graphql') {
      const parentType =
        GqlExecutionContext.create(context).getInfo()?.parentType?.name;
      if (parentType && !ROOT_OPERATION_TYPES.has(parentType)) {
        return true;
      }
    }
    return super.canActivate(context);
  }

  getRequestResponse(context: ExecutionContext) {
    if (context.getType<string>() === 'graphql') {
      const gqlCtx = GqlExecutionContext.create(context);
      const ctx = gqlCtx.getContext();
      return { req: ctx?.req, res: ctx?.res };
    }
    const http = context.switchToHttp();
    return { req: http.getRequest(), res: http.getResponse() };
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const userId = req?.user?.sub ?? req?.user?.id;
    if (userId) {
      return `user:${userId}`;
    }
    return req?.ip ?? 'unknown';
  }

  protected setResponseHeader(res: any, name: string, value: string | number) {
    if (
      res &&
      (typeof res.header === 'function' || typeof res.setHeader === 'function')
    ) {
      super.setResponseHeader(res, name, value);
    }
  }
}
