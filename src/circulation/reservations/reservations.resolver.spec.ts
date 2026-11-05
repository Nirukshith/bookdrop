import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ReservationCancelReason,
  ReservationStatus,
  Role,
} from '@prisma/client';
import { AuthenticatedUser } from '../../auth';
import { PrismaService } from '../../prisma/prisma.service';
import { ReservationsService } from './reservations.service';
import { ReservationsDataLoader } from './reservations.loader';
import { ReservationsResolver } from './reservations.resolver';
import { ReservationNotFoundError } from './errors';

describe('ReservationsResolver', () => {
  let resolver: ReservationsResolver;
  let reservationsServiceMock: any;
  let dataloaderMock: any;
  let prismaMock: any;

  const memberUser: AuthenticatedUser = {
    sub: 42,
    email: 'patron@example.com',
    role: Role.MEMBER,
  };

  const staffUser: AuthenticatedUser = {
    sub: 99,
    email: 'librarian@example.com',
    role: Role.LIBRARIAN,
  };

  const fixedNow = new Date('2026-11-01T12:00:00.000Z');

  beforeEach(async () => {
    reservationsServiceMock = {
      joinQueue: jest.fn(),
      leaveQueue: jest.fn(),
      myReservations: jest.fn(),
      getQueueForBook: jest.fn(),
      getQueuePosition: jest.fn(),
    };

    dataloaderMock = {
      loadBook: jest.fn(),
      loadUser: jest.fn(),
      loadHold: jest.fn(),
    };

    prismaMock = {
      reservation: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsResolver,
        { provide: ReservationsService, useValue: reservationsServiceMock },
        { provide: ReservationsDataLoader, useValue: dataloaderMock },
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    resolver = module.get<ReservationsResolver>(ReservationsResolver);
  });

  it('should be defined', () => {
    expect(resolver).toBeDefined();
  });

  describe('Mutations', () => {
    it('joinReservationQueue calls service with user.sub and bookId', async () => {
      const mockResult = {
        id: 1,
        userId: 42,
        bookId: 10,
        status: ReservationStatus.WAITING,
        createdAt: fixedNow,
        position: 1,
      };
      reservationsServiceMock.joinQueue.mockResolvedValueOnce(mockResult);

      const result = await resolver.joinReservationQueue(10, memberUser);
      expect(result).toEqual(mockResult);
      expect(reservationsServiceMock.joinQueue).toHaveBeenCalledWith(42, 10);
    });

    it('cancelReservation maps MEMBER reason for patron user', async () => {
      reservationsServiceMock.leaveQueue.mockResolvedValueOnce({ id: 1 });

      await resolver.cancelReservation(1, 'No longer needed', memberUser);

      expect(reservationsServiceMock.leaveQueue).toHaveBeenCalledWith(
        1,
        { id: 42, role: Role.MEMBER },
        ReservationCancelReason.MEMBER,
      );
    });

    it('cancelReservation maps STAFF reason for librarian user', async () => {
      reservationsServiceMock.leaveQueue.mockResolvedValueOnce({ id: 1 });

      await resolver.cancelReservation(1, 'Patron moved', staffUser);

      expect(reservationsServiceMock.leaveQueue).toHaveBeenCalledWith(
        1,
        { id: 99, role: Role.LIBRARIAN },
        ReservationCancelReason.STAFF,
      );
    });
  });

  describe('Queries', () => {
    it('myReservations calls service with user.sub', async () => {
      const mockList = [{ id: 1, userId: 42, position: 1 }];
      reservationsServiceMock.myReservations.mockResolvedValueOnce(mockList);

      const result = await resolver.myReservations(memberUser);
      expect(result).toEqual(mockList);
      expect(reservationsServiceMock.myReservations).toHaveBeenCalledWith(42);
    });

    it('queueForBook calls service with bookId', async () => {
      const mockList = [{ id: 1, bookId: 10, position: 1 }];
      reservationsServiceMock.getQueueForBook.mockResolvedValueOnce(mockList);

      const result = await resolver.queueForBook(10);
      expect(result).toEqual(mockList);
      expect(reservationsServiceMock.getQueueForBook).toHaveBeenCalledWith(10);
    });

    it('reservation throws ReservationNotFoundError if not found', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce(null);

      await expect(resolver.reservation(999, memberUser)).rejects.toThrow(
        ReservationNotFoundError,
      );
    });

    it('reservation throws ForbiddenException if member tries to read another patron reservation', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce({
        id: 1,
        userId: 100, // another user
      });

      await expect(resolver.reservation(1, memberUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('reservation returns reservation with computed position for staff', async () => {
      prismaMock.reservation.findUnique.mockResolvedValueOnce({
        id: 1,
        userId: 100,
        bookId: 10,
        status: ReservationStatus.WAITING,
      });
      reservationsServiceMock.getQueuePosition.mockResolvedValueOnce(2);

      const result = await resolver.reservation(1, staffUser);
      expect(result).toEqual({
        id: 1,
        userId: 100,
        bookId: 10,
        status: ReservationStatus.WAITING,
        position: 2,
      });
    });
  });

  describe('Field Resolvers', () => {
    it('resolvePosition returns preset position if present', async () => {
      const position = await resolver.resolvePosition({
        id: 1,
        status: ReservationStatus.WAITING,
        position: 3,
      } as any);
      expect(position).toBe(3);
      expect(reservationsServiceMock.getQueuePosition).not.toHaveBeenCalled();
    });

    it('resolvePosition returns null for non-WAITING reservation', async () => {
      const position = await resolver.resolvePosition({
        id: 1,
        status: ReservationStatus.PROMOTED,
      } as any);
      expect(position).toBeNull();
    });

    it('resolveBook loads book via dataloader', async () => {
      const mockBook = { id: 10, title: 'Clean Architecture' };
      dataloaderMock.loadBook.mockResolvedValueOnce(mockBook);

      const result = await resolver.resolveBook({ id: 1, bookId: 10 } as any);
      expect(result).toEqual(mockBook);
      expect(dataloaderMock.loadBook).toHaveBeenCalledWith(10);
    });

    it('resolveUser hides member details from unauthorized members', async () => {
      const result = await resolver.resolveUser(
        { id: 1, userId: 100 } as any,
        memberUser,
      );
      expect(result).toBeNull();
      expect(dataloaderMock.loadUser).not.toHaveBeenCalled();
    });

    it('resolveUser loads member details for staff or owner', async () => {
      const mockMember = {
        id: 42,
        name: 'Patron',
        email: 'patron@example.com',
        role: Role.MEMBER,
      };
      dataloaderMock.loadUser.mockResolvedValueOnce(mockMember);

      const result = await resolver.resolveUser(
        { id: 1, userId: 42 } as any,
        memberUser,
      );
      expect(result).toEqual(
        expect.objectContaining({ id: 42, name: 'Patron' }),
      );
    });

    it('resolveHold returns null if holdId is absent', async () => {
      const result = await resolver.resolveHold({ id: 1, holdId: null } as any);
      expect(result).toBeNull();
      expect(dataloaderMock.loadHold).not.toHaveBeenCalled();
    });

    it('resolveHold loads hold via dataloader if holdId is present', async () => {
      const mockHold = { id: 77 };
      dataloaderMock.loadHold.mockResolvedValueOnce(mockHold);

      const result = await resolver.resolveHold({ id: 1, holdId: 77 } as any);
      expect(result).toEqual(mockHold);
      expect(dataloaderMock.loadHold).toHaveBeenCalledWith(77);
    });
  });
});
