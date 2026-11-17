import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CopyStatus,
  HoldSource,
  HoldStatus,
  ReservationStatus,
} from '@prisma/client';
import { PromotionService } from './promotion.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import { MemberEligibilityPolicy } from '../holds/member-eligibility.policy';
import { CopiesService } from '../copies/copies.service';
import { HoldCreatedEvent } from '../holds/events';
import { ReservationPromotedEvent } from './events';
import { UnpaidFinesError } from '../holds/errors';

describe('PromotionService', () => {
  let service: PromotionService;
  let prismaMock: any;
  let clockServiceMock: any;
  let eventEmitterMock: any;
  let eligibilityPolicyMock: any;
  let copiesServiceMock: any;

  const fixedNow = new Date('2026-11-01T10:00:00.000Z');
  const bookId = 15;
  const copyId = 42;

  beforeEach(async () => {
    prismaMock = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      $queryRaw: jest.fn(),
      reservation: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      hold: {
        create: jest.fn(),
      },
    };

    clockServiceMock = {
      now: jest.fn().mockReturnValue(fixedNow),
    };

    eventEmitterMock = {
      emit: jest.fn(),
    };

    eligibilityPolicyMock = {
      checkRequestEligibility: jest.fn().mockResolvedValue(undefined),
    };

    copiesServiceMock = {
      transitionStatus: jest.fn().mockResolvedValue({ id: copyId }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PromotionService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: ClockService, useValue: clockServiceMock },
        { provide: EventEmitter2, useValue: eventEmitterMock },
        { provide: MemberEligibilityPolicy, useValue: eligibilityPolicyMock },
        { provide: CopiesService, useValue: copiesServiceMock },
      ],
    }).compile();

    service = module.get<PromotionService>(PromotionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('returns { consumed: false } when no reservations are WAITING for the book', async () => {
    prismaMock.reservation.findMany.mockResolvedValueOnce([]);

    const result = await service.promoteNextForBook(copyId, bookId, prismaMock);

    expect(result).toEqual({ consumed: false });
    expect(copiesServiceMock.transitionStatus).not.toHaveBeenCalled();
    expect(prismaMock.hold.create).not.toHaveBeenCalled();
    expect(eventEmitterMock.emit).not.toHaveBeenCalled();
  });

  it('skips candidates that are no longer WAITING when locked FOR UPDATE', async () => {
    prismaMock.reservation.findMany.mockResolvedValueOnce([
      { id: 10, userId: 101, status: ReservationStatus.WAITING },
      { id: 11, userId: 102, status: ReservationStatus.WAITING },
    ]);

    // First candidate was concurrently cancelled
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: 10, userId: 101, status: ReservationStatus.CANCELLED },
    ]);
    // Second candidate is still WAITING
    prismaMock.$queryRaw.mockResolvedValueOnce([
      { id: 11, userId: 102, status: ReservationStatus.WAITING },
    ]);

    const createdHold = {
      id: 501,
      userId: 102,
      bookId,
      copyId,
      status: HoldStatus.ACTIVE,
      source: HoldSource.QUEUE_PROMOTION,
      expiresAt: new Date(fixedNow.getTime() + 86400000),
      createdAt: fixedNow,
    };
    prismaMock.hold.create.mockResolvedValueOnce(createdHold);

    const result = await service.promoteNextForBook(copyId, bookId, prismaMock);

    expect(result).toEqual({
      consumed: true,
      holdId: 501,
      reservationId: 11,
      userId: 102,
    });

    expect(eligibilityPolicyMock.checkRequestEligibility).toHaveBeenCalledWith(
      102,
      bookId,
      prismaMock,
    );
  });

  it('skips ineligible candidates, preserves their position, and promotes the next eligible candidate', async () => {
    prismaMock.reservation.findMany.mockResolvedValueOnce([
      { id: 10, userId: 101, status: ReservationStatus.WAITING },
      { id: 11, userId: 102, status: ReservationStatus.WAITING },
    ]);

    // Both locked rows are WAITING
    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { id: 10, userId: 101, status: ReservationStatus.WAITING },
      ])
      .mockResolvedValueOnce([
        { id: 11, userId: 102, status: ReservationStatus.WAITING },
      ]);

    // Candidate 1 (user 101) has unpaid fines -> throws UnpaidFinesError
    eligibilityPolicyMock.checkRequestEligibility
      .mockRejectedValueOnce(new UnpaidFinesError())
      .mockResolvedValueOnce(undefined); // Candidate 2 is eligible

    const createdHold = {
      id: 502,
      userId: 102,
      bookId,
      copyId,
      status: HoldStatus.ACTIVE,
      source: HoldSource.QUEUE_PROMOTION,
      expiresAt: new Date(fixedNow.getTime() + 86400000),
      createdAt: fixedNow,
    };
    prismaMock.hold.create.mockResolvedValueOnce(createdHold);

    const onCommitMock = jest.fn((cb) => cb());

    const result = await service.promoteNextForBook(
      copyId,
      bookId,
      prismaMock,
      onCommitMock,
    );

    expect(result).toEqual({
      consumed: true,
      holdId: 502,
      reservationId: 11,
      userId: 102,
    });

    // Ineligible candidate 1 was NOT modified
    expect(prismaMock.reservation.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 10 } }),
    );

    // Eligible candidate 2 WAS promoted
    expect(prismaMock.reservation.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: {
        status: ReservationStatus.PROMOTED,
        promotedAt: fixedNow,
        holdId: 502,
      },
    });

    // Copy was transitioned to ON_HOLD
    expect(copiesServiceMock.transitionStatus).toHaveBeenCalledWith(
      copyId,
      [CopyStatus.AVAILABLE],
      CopyStatus.ON_HOLD,
      expect.objectContaining({
        reason: 'Promotion from reservation #11',
        skipPromotion: true,
      }),
      prismaMock,
    );

    // Events emitted post-commit
    expect(onCommitMock).toHaveBeenCalled();
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      HoldCreatedEvent.EVENT_NAME,
      expect.objectContaining({
        holdId: 502,
        userId: 102,
        bookId,
        copyId,
      }),
    );
    expect(eventEmitterMock.emit).toHaveBeenCalledWith(
      ReservationPromotedEvent.EVENT_NAME,
      expect.objectContaining({
        reservationId: 11,
        userId: 102,
        bookId,
        holdId: 502,
        copyId,
      }),
    );
  });

  it('returns { consumed: false } when all candidates in the queue are ineligible', async () => {
    prismaMock.reservation.findMany.mockResolvedValueOnce([
      { id: 10, userId: 101, status: ReservationStatus.WAITING },
      { id: 11, userId: 102, status: ReservationStatus.WAITING },
    ]);

    prismaMock.$queryRaw
      .mockResolvedValueOnce([
        { id: 10, userId: 101, status: ReservationStatus.WAITING },
      ])
      .mockResolvedValueOnce([
        { id: 11, userId: 102, status: ReservationStatus.WAITING },
      ]);

    eligibilityPolicyMock.checkRequestEligibility.mockRejectedValue(
      new UnpaidFinesError(),
    );

    const result = await service.promoteNextForBook(copyId, bookId, prismaMock);

    expect(result).toEqual({ consumed: false });
    expect(copiesServiceMock.transitionStatus).not.toHaveBeenCalled();
    expect(prismaMock.hold.create).not.toHaveBeenCalled();
    expect(prismaMock.reservation.update).not.toHaveBeenCalled();
  });

  it('onCopyAvailable delegates cleanly to promoteNextForBook', async () => {
    prismaMock.reservation.findMany.mockResolvedValueOnce([]);

    const result = await service.onCopyAvailable(copyId, bookId, prismaMock);

    expect(result).toEqual({ consumed: false });
  });
});
