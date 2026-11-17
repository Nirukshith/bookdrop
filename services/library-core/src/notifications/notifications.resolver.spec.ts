import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth';
import { PrismaService } from '../prisma/prisma.service';
import { IDENTITY_PUBLIC_API } from '../users';
import { NotificationsResolver } from './notifications.resolver';
import { NotificationStatus, NotificationTemplate } from './notification.types';

describe('NotificationsResolver', () => {
  let resolver: NotificationsResolver;
  let prismaMock: {
    notification: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
  };
  let identityPublicApiMock: {
    findMemberByEmail: jest.Mock;
    getMembersByIds: jest.Mock;
  };

  const mockUser: AuthenticatedUser = {
    sub: 42,
    email: 'patron@example.com',
    role: Role.MEMBER,
  };

  beforeEach(async () => {
    prismaMock = {
      notification: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };

    identityPublicApiMock = {
      findMemberByEmail: jest.fn(),
      getMembersByIds: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsResolver,
        { provide: PrismaService, useValue: prismaMock },
        { provide: IDENTITY_PUBLIC_API, useValue: identityPublicApiMock },
      ],
    }).compile();

    resolver = module.get<NotificationsResolver>(NotificationsResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('myNotifications', () => {
    it('returns notifications for the current authenticated user', async () => {
      const mockList = [
        {
          id: 1,
          userId: 42,
          template: NotificationTemplate.LOAN_STARTED,
          status: NotificationStatus.SENT,
          createdAt: new Date(),
          sentAt: new Date(),
        },
      ];
      prismaMock.notification.findMany.mockResolvedValue(mockList);

      const result = await resolver.myNotifications(mockUser, {
        take: 10,
        skip: 0,
      });

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 42 },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 0,
      });
      expect(result).toEqual(mockList);
    });

    it('uses default pagination if not provided', async () => {
      prismaMock.notification.findMany.mockResolvedValue([]);

      await resolver.myNotifications(mockUser);

      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 42 },
        orderBy: { createdAt: 'desc' },
        take: 20,
        skip: 0,
      });
    });
  });

  describe('memberNotifications', () => {
    it('resolves member by email and returns their notification history', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValue({
        id: 99,
        email: 'other@example.com',
        name: 'Other User',
        role: Role.MEMBER,
      });
      const mockList = [
        {
          id: 2,
          userId: 99,
          template: NotificationTemplate.WELCOME,
          status: NotificationStatus.SENT,
          createdAt: new Date(),
          sentAt: new Date(),
        },
      ];
      prismaMock.notification.findMany.mockResolvedValue(mockList);

      const result = await resolver.memberNotifications('other@example.com', {
        take: 5,
        skip: 5,
      });

      expect(identityPublicApiMock.findMemberByEmail).toHaveBeenCalledWith(
        'other@example.com',
      );
      expect(prismaMock.notification.findMany).toHaveBeenCalledWith({
        where: { userId: 99 },
        orderBy: { createdAt: 'desc' },
        take: 5,
        skip: 5,
      });
      expect(result).toEqual(mockList);
    });

    it('throws NotFoundException if member email does not exist', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValue(null);

      await expect(
        resolver.memberNotifications('unknown@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('retryNotification', () => {
    it('throws NotFoundException if notification id does not exist', async () => {
      prismaMock.notification.findUnique.mockResolvedValue(null);

      await expect(resolver.retryNotification(123)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException if notification is not FAILED', async () => {
      prismaMock.notification.findUnique.mockResolvedValue({
        id: 123,
        status: NotificationStatus.SENT,
      });

      await expect(resolver.retryNotification(123)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('resets a FAILED notification back to PENDING for re-delivery', async () => {
      prismaMock.notification.findUnique.mockResolvedValue({
        id: 123,
        status: NotificationStatus.FAILED,
      });
      const updated = {
        id: 123,
        status: NotificationStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
        lastError: null,
      };
      prismaMock.notification.update.mockResolvedValue(updated);

      const result = await resolver.retryNotification(123);

      expect(prismaMock.notification.update).toHaveBeenCalledWith({
        where: { id: 123 },
        data: {
          status: NotificationStatus.PENDING,
          attempts: 0,
          nextAttemptAt: expect.any(Date),
          lastError: null,
        },
      });
      expect(result).toEqual(updated);
    });
  });
});
