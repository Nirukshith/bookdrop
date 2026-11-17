import { PrismaClient, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { bootstrapAdmin } from './create-admin';

jest.mock('argon2', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password-123'),
}));

describe('bootstrapAdmin', () => {
  let mockPrisma: any;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      refreshToken: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $disconnect: jest.fn(),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws an error if ADMIN_EMAIL is missing', async () => {
    delete process.env.ADMIN_EMAIL;
    process.env.ADMIN_NAME = 'Admin User';
    process.env.ADMIN_PASSWORD = 'SecurePassword123!';

    await expect(
      bootstrapAdmin(mockPrisma as unknown as PrismaClient),
    ).rejects.toThrow('ADMIN_EMAIL environment variable is required.');
  });

  it('throws an error if ADMIN_EMAIL is not a valid email', async () => {
    process.env.ADMIN_EMAIL = 'invalid-email-format';
    process.env.ADMIN_NAME = 'Admin User';
    process.env.ADMIN_PASSWORD = 'SecurePassword123!';

    await expect(
      bootstrapAdmin(mockPrisma as unknown as PrismaClient),
    ).rejects.toThrow('ADMIN_EMAIL must be a valid email address.');
  });

  it('throws an error if ADMIN_NAME is missing', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    delete process.env.ADMIN_NAME;
    process.env.ADMIN_PASSWORD = 'SecurePassword123!';

    await expect(
      bootstrapAdmin(mockPrisma as unknown as PrismaClient),
    ).rejects.toThrow('ADMIN_NAME environment variable is required.');
  });

  it('throws an error if ADMIN_PASSWORD is missing', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_NAME = 'Admin User';
    delete process.env.ADMIN_PASSWORD;

    await expect(
      bootstrapAdmin(mockPrisma as unknown as PrismaClient),
    ).rejects.toThrow('ADMIN_PASSWORD environment variable is required.');
  });

  it('throws an error if ADMIN_PASSWORD is shorter than 8 characters', async () => {
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_NAME = 'Admin User';
    process.env.ADMIN_PASSWORD = 'short';

    await expect(
      bootstrapAdmin(mockPrisma as unknown as PrismaClient),
    ).rejects.toThrow('ADMIN_PASSWORD must be at least 8 characters long');
  });

  it('creates a new ADMIN user when user does not exist', async () => {
    process.env.ADMIN_EMAIL = 'NewAdmin@example.com';
    process.env.ADMIN_NAME = 'New Admin';
    process.env.ADMIN_PASSWORD = 'ValidPassword123!';

    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 1,
      email: 'newadmin@example.com',
      name: 'New Admin',
      role: Role.ADMIN,
      passwordHash: 'hashed-password-123',
    });

    const result = await bootstrapAdmin(mockPrisma as unknown as PrismaClient);

    expect(argon2.hash).toHaveBeenCalledWith('ValidPassword123!');
    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        email: 'newadmin@example.com',
        name: 'New Admin',
        passwordHash: 'hashed-password-123',
        role: Role.ADMIN,
      },
    });
    expect(result.role).toBe(Role.ADMIN);
    expect(result.email).toBe('newadmin@example.com');
  });

  it('promotes existing user to ADMIN and updates password and revokes tokens', async () => {
    process.env.ADMIN_EMAIL = 'existing@example.com';
    process.env.ADMIN_NAME = 'Existing Member';
    process.env.ADMIN_PASSWORD = 'NewSecurePassword123!';

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 5,
      email: 'existing@example.com',
      name: 'Existing Member',
      role: Role.MEMBER,
      passwordHash: 'old-hash',
    });

    mockPrisma.user.update.mockResolvedValue({
      id: 5,
      email: 'existing@example.com',
      name: 'Existing Member',
      role: Role.ADMIN,
      passwordHash: 'hashed-password-123',
    });

    const result = await bootstrapAdmin(mockPrisma as unknown as PrismaClient);

    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { email: 'existing@example.com' },
      data: {
        name: 'Existing Member',
        role: Role.ADMIN,
        passwordHash: 'hashed-password-123',
      },
    });
    expect(mockPrisma.refreshToken.updateMany).toHaveBeenCalledWith({
      where: { userId: 5, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(result.role).toBe(Role.ADMIN);
  });
});
