import { ExecutionContext, Injectable } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class GqlThrottlerGuard extends ThrottlerGuard {
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
