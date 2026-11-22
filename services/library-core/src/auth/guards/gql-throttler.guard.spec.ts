import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerStorage } from '@nestjs/throttler';
import { GqlThrottlerGuard } from './gql-throttler.guard';

describe('GqlThrottlerGuard', () => {
  let guard: GqlThrottlerGuard;
  let superCanActivate: jest.SpyInstance;

  function createGqlContext(parentTypeName: string): ExecutionContext {
    const info = { parentType: { name: parentTypeName } };
    return {
      getType: jest.fn().mockReturnValue('graphql'),
      getClass: jest.fn().mockReturnValue(class TestResolver {}),
      getHandler: jest.fn().mockReturnValue(function testMethod() {}),
      getArgs: jest.fn().mockReturnValue([{}, {}, { req: {} }, info]),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    guard = new GqlThrottlerGuard(
      [{ name: 'default', ttl: 60000, limit: 100 }],
      {} as ThrottlerStorage,
      {} as Reflector,
    );
    superCanActivate = jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockResolvedValue(true);
  });

  afterEach(() => {
    superCanActivate.mockRestore();
  });

  it.each(['Book', 'Loan', 'Hold', 'User'])(
    'does not count %s field resolvers against the rate limit',
    async (parentType) => {
      await expect(
        guard.canActivate(createGqlContext(parentType)),
      ).resolves.toBe(true);
      expect(superCanActivate).not.toHaveBeenCalled();
    },
  );

  it.each(['Query', 'Mutation', 'Subscription'])(
    'throttles root %s operations',
    async (parentType) => {
      const ctx = createGqlContext(parentType);
      await guard.canActivate(ctx);
      expect(superCanActivate).toHaveBeenCalledWith(ctx);
    },
  );

  it('throttles plain HTTP requests', async () => {
    const ctx = {
      getType: jest.fn().mockReturnValue('http'),
    } as unknown as ExecutionContext;
    await guard.canActivate(ctx);
    expect(superCanActivate).toHaveBeenCalledWith(ctx);
  });

  it('propagates a throttling rejection for root operations', async () => {
    superCanActivate.mockRejectedValueOnce(
      new Error('ThrottlerException: Too Many Requests'),
    );
    await expect(guard.canActivate(createGqlContext('Query'))).rejects.toThrow(
      'Too Many Requests',
    );
  });
});
