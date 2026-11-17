import 'dotenv/config';
import * as argon2 from 'argon2';
import { PrismaClient, Role, User } from '@prisma/client';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function bootstrapAdmin(
  prismaClient?: PrismaClient,
): Promise<User> {
  const prisma = prismaClient || new PrismaClient();

  const emailRaw = process.env.ADMIN_EMAIL;
  const nameRaw = process.env.ADMIN_NAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!emailRaw || !emailRaw.trim()) {
    throw new Error('ADMIN_EMAIL environment variable is required.');
  }

  const email = emailRaw.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email)) {
    throw new Error('ADMIN_EMAIL must be a valid email address.');
  }

  if (!nameRaw || !nameRaw.trim()) {
    throw new Error('ADMIN_NAME environment variable is required.');
  }
  const name = nameRaw.trim();

  if (!password) {
    throw new Error('ADMIN_PASSWORD environment variable is required.');
  }

  if (password.length < 8) {
    throw new Error(
      'ADMIN_PASSWORD must be at least 8 characters long (same as registration rules).',
    );
  }

  try {
    const passwordHash = await argon2.hash(password);

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      const updatedUser = await prisma.user.update({
        where: { email },
        data: {
          name,
          role: Role.ADMIN,
          passwordHash,
        },
      });

      // Revoke any active sessions for security
      await prisma.refreshToken.updateMany({
        where: { userId: updatedUser.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      console.log(
        `✅ Existing user "${email}" promoted to ADMIN and password updated successfully.`,
      );
      return updatedUser;
    }

    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: Role.ADMIN,
      },
    });

    console.log(
      `✅ New administrator "${email}" created successfully with role ADMIN.`,
    );
    return newUser;
  } finally {
    if (!prismaClient) {
      await prisma.$disconnect();
    }
  }
}

if (require.main === module) {
  bootstrapAdmin()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error(
        `❌ Failed to bootstrap admin account: ${error instanceof Error ? error.message : error}`,
      );
      process.exit(1);
    });
}
