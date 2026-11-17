import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  function createMockContext(options: {
    type?: 'graphql' | 'http';
    user?: { role?: string; [key: string]: any };
  }): ExecutionContext {
    const req = { user: options.user };
    return {
      getType: jest.fn().mockReturnValue(options.type ?? 'graphql'),
      getClass: jest.fn().mockReturnValue(class TestResolver {}),
      getHandler: jest.fn().mockReturnValue(function testMethod() {}),
      getArgs: jest.fn().mockReturnValue([{}, {}, { req }, {}]),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(req),
      }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    } as unknown as jest.Mocked<Reflector>;

    guard = new RolesGuard(reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('public routes', () => {
    it('allows access immediately when route is marked @Public()', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return true;
        return undefined;
      });

      const context = createMockContext({ user: undefined });
      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('routes without role requirements', () => {
    it('allows access when no roles are specified in metadata', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return undefined;
        return undefined;
      });

      const context = createMockContext({ user: { role: Role.MEMBER } });
      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('allows access when roles array is empty', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return [];
        return undefined;
      });

      const context = createMockContext({ user: { role: Role.MEMBER } });
      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('role enforcement', () => {
    it('allows access when user has the exact required role', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return [Role.ADMIN];
        return undefined;
      });

      const context = createMockContext({
        user: { role: Role.ADMIN },
      });
      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('allows access when user role is in the list of multiple allowed roles', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return [Role.LIBRARIAN, Role.ADMIN];
        return undefined;
      });

      const librarianContext = createMockContext({
        user: { role: Role.LIBRARIAN },
      });
      const adminContext = createMockContext({
        user: { role: Role.ADMIN },
      });

      expect(guard.canActivate(librarianContext)).toBe(true);
      expect(guard.canActivate(adminContext)).toBe(true);
    });

    it('blocks access with ForbiddenException when user has the wrong role', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return [Role.ADMIN];
        return undefined;
      });

      const context = createMockContext({
        user: { role: Role.MEMBER },
      });

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Access denied: insufficient permissions'),
      );
    });

    it('blocks access with ForbiddenException when MEMBER attempts LIBRARIAN/ADMIN route', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return [Role.LIBRARIAN, Role.ADMIN];
        return undefined;
      });

      const context = createMockContext({
        user: { role: Role.MEMBER },
      });

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Access denied: insufficient permissions'),
      );
    });

    it('blocks access with ForbiddenException when user object is missing', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return [Role.ADMIN];
        return undefined;
      });

      const context = createMockContext({ user: undefined });

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Access denied: insufficient permissions'),
      );
    });

    it('blocks access with ForbiddenException when user has no role defined', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return [Role.ADMIN];
        return undefined;
      });

      const context = createMockContext({ user: { role: undefined } });

      expect(() => guard.canActivate(context)).toThrow(
        new ForbiddenException('Access denied: insufficient permissions'),
      );
    });
  });

  describe('HTTP execution context compatibility', () => {
    it('verifies roles correctly on standard HTTP requests', () => {
      reflector.getAllAndOverride.mockImplementation((key) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === ROLES_KEY) return [Role.ADMIN];
        return undefined;
      });

      const httpContext = createMockContext({
        type: 'http',
        user: { role: Role.ADMIN },
      });

      expect(guard.canActivate(httpContext)).toBe(true);
    });
  });
});
