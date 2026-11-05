import { Test, TestingModule } from '@nestjs/testing';
import { FineReason, FineStatus } from '@prisma/client';
import { BadRequestException } from '@nestjs/common';
import { FinesResolver, MyFineModelResolver } from './fines.resolver';
import { FinesService } from './fines.service';
import { FinesDataLoader } from './fines.loader';
import { PrismaService } from '../../prisma/prisma.service';
import { IDENTITY_PUBLIC_API } from '../../users';
import { MemberNotFoundError } from '../loans/errors/member-not-found.error';
import { InvalidAmountError } from './errors/invalid-amount.error';

describe('FinesResolver', () => {
  let resolver: FinesResolver;
  let myFineResolver: MyFineModelResolver;
  let finesServiceMock: {
    recordPayment: jest.Mock;
    waiveFine: jest.Mock;
    getMemberFines: jest.Mock;
    listFines: jest.Mock;
    getFine: jest.Mock;
  };
  let prismaMock: {
    finePayment: {
      findMany: jest.Mock;
    };
  };
  let identityPublicApiMock: {
    findMemberByEmail: jest.Mock;
  };
  let finesDataLoaderMock: {
    loadBookTitleForLoan: jest.Mock;
  };

  const fixedNow = new Date('2026-11-04T12:00:00Z');

  beforeEach(async () => {
    finesServiceMock = {
      recordPayment: jest.fn(),
      waiveFine: jest.fn(),
      getMemberFines: jest.fn(),
      listFines: jest.fn(),
      getFine: jest.fn(),
    };

    prismaMock = {
      finePayment: {
        findMany: jest.fn(),
      },
    };

    identityPublicApiMock = {
      findMemberByEmail: jest.fn(),
    };

    finesDataLoaderMock = {
      loadBookTitleForLoan: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinesResolver,
        MyFineModelResolver,
        {
          provide: FinesService,
          useValue: finesServiceMock,
        },
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: IDENTITY_PUBLIC_API,
          useValue: identityPublicApiMock,
        },
        {
          provide: FinesDataLoader,
          useValue: finesDataLoaderMock,
        },
      ],
    }).compile();

    resolver = module.get<FinesResolver>(FinesResolver);
    myFineResolver = module.get<MyFineModelResolver>(MyFineModelResolver);
  });

  it('is defined', () => {
    expect(resolver).toBeDefined();
    expect(myFineResolver).toBeDefined();
  });

  describe('recordFinePayment mutation', () => {
    it('converts decimal Rupee amount to minor units and records payment', async () => {
      const mockFine = {
        id: 1,
        userId: 10,
        reason: FineReason.LATE_RETURN,
        amountMinor: 5000,
        paidMinor: 2550,
        status: FineStatus.PARTIALLY_PAID,
        createdAt: fixedNow,
      };

      finesServiceMock.recordPayment.mockResolvedValueOnce(mockFine);

      const result = await resolver.recordFinePayment(
        1,
        25.5,
        'Desk cash payment',
        { sub: 42, role: 'LIBRARIAN' } as any,
      );

      expect(finesServiceMock.recordPayment).toHaveBeenCalledWith(
        1,
        2550,
        42,
        'Desk cash payment',
      );
      expect(result).toEqual(mockFine);
    });

    it('rejects sub-cent amounts with more than 2 decimal places with INVALID_AMOUNT', async () => {
      await expect(
        resolver.recordFinePayment(1, 25.555, 'Over-precision', {
          sub: 42,
        } as any),
      ).rejects.toThrow(InvalidAmountError);

      expect(finesServiceMock.recordPayment).not.toHaveBeenCalled();
    });

    it('rejects zero or negative payment amounts with INVALID_AMOUNT', async () => {
      await expect(
        resolver.recordFinePayment(1, 0, 'Zero payment', { sub: 42 } as any),
      ).rejects.toThrow(InvalidAmountError);

      await expect(
        resolver.recordFinePayment(1, -10, 'Negative payment', {
          sub: 42,
        } as any),
      ).rejects.toThrow(InvalidAmountError);
    });
  });

  describe('waiveFine mutation', () => {
    it('successfully waives fine when valid reason is provided', async () => {
      const mockFine = {
        id: 2,
        userId: 10,
        status: FineStatus.WAIVED,
        waivedReason: 'Medical emergency',
      };
      finesServiceMock.waiveFine.mockResolvedValueOnce(mockFine);

      const result = await resolver.waiveFine(2, 'Medical emergency', {
        sub: 99,
        role: 'ADMIN',
      } as any);

      expect(finesServiceMock.waiveFine).toHaveBeenCalledWith(
        2,
        'Medical emergency',
        99,
      );
      expect(result).toEqual(mockFine);
    });

    it('throws BadRequestException if waiver reason is empty or whitespace', async () => {
      await expect(
        resolver.waiveFine(2, '   ', { sub: 99 } as any),
      ).rejects.toThrow(BadRequestException);

      expect(finesServiceMock.waiveFine).not.toHaveBeenCalled();
    });
  });

  describe('memberFines query', () => {
    it('finds member by email and retrieves their fines', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValueOnce({
        id: 15,
        email: 'patron@example.com',
      });
      finesServiceMock.getMemberFines.mockResolvedValueOnce({
        fines: [{ id: 1, userId: 15, amountMinor: 500, paidMinor: 0 }],
        totalOutstandingMinor: 500,
      });

      const fines = await resolver.memberFines(
        'patron@example.com',
        FineStatus.UNPAID,
      );

      expect(identityPublicApiMock.findMemberByEmail).toHaveBeenCalledWith(
        'patron@example.com',
      );
      expect(finesServiceMock.getMemberFines).toHaveBeenCalledWith(
        15,
        FineStatus.UNPAID,
      );
      expect(fines).toHaveLength(1);
    });

    it('throws MemberNotFoundError when email does not match any registered member', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValueOnce(null);

      await expect(resolver.memberFines('unknown@example.com')).rejects.toThrow(
        MemberNotFoundError,
      );

      expect(finesServiceMock.getMemberFines).not.toHaveBeenCalled();
    });
  });

  describe('fines and fine queries', () => {
    it('retrieves paginated fines with filters', async () => {
      finesServiceMock.listFines.mockResolvedValueOnce({
        items: [{ id: 1 }, { id: 2 }],
        total: 2,
      });

      const items = await resolver.fines(
        { status: FineStatus.UNPAID },
        { skip: 0, take: 10 },
      );

      expect(finesServiceMock.listFines).toHaveBeenCalledWith(
        { status: FineStatus.UNPAID },
        { skip: 0, take: 10 },
      );
      expect(items).toHaveLength(2);
    });

    it('retrieves a single fine with payment ledger', async () => {
      const mockFine = { id: 5, payments: [] };
      finesServiceMock.getFine.mockResolvedValueOnce(mockFine);

      const result = await resolver.fine(5);

      expect(finesServiceMock.getFine).toHaveBeenCalledWith(5);
      expect(result).toEqual(mockFine);
    });
  });

  describe('myFines query (Member)', () => {
    it('retrieves member fines, converting minor units to Rupees and redacting internal fields', async () => {
      finesServiceMock.getMemberFines.mockResolvedValueOnce({
        fines: [
          {
            id: 101,
            userId: 77,
            reason: FineReason.LATE_RETURN,
            amountMinor: 2550,
            paidMinor: 500,
            status: FineStatus.PARTIALLY_PAID,
            loanId: 12,
            uncappedAmountMinor: 5000,
            capMinor: 2550,
            createdById: 99, // staff
            createdAt: fixedNow,
          },
        ],
        totalOutstandingMinor: 2050,
      });

      const result = await resolver.myFines(
        { sub: 77, role: 'MEMBER' } as any,
        FineStatus.PARTIALLY_PAID,
      );

      expect(result).toHaveLength(1);
      const fine = result[0];
      expect(fine.id).toBe(101);
      expect(fine.originalAmountRs).toBe(25.5);
      expect(fine.paidAmountRs).toBe(5);
      expect(fine.outstandingAmountRs).toBe(20.5);
      expect(fine.status).toBe(FineStatus.PARTIALLY_PAID);
      expect(fine.loanId).toBe(12);
      expect(fine.uncappedAmountRs).toBe(50);
      expect(fine.capRs).toBe(25.5);
      expect(fine.wasCapped).toBe(true);
      expect((fine as any).userId).toBeUndefined();
      expect((fine as any).createdById).toBeUndefined();
    });
  });

  describe('Field Resolvers', () => {
    it('resolves calculated rupee amounts and payments on FineModel', async () => {
      const fine = {
        id: 1,
        amountMinor: 3000,
        paidMinor: 1000,
        uncappedAmountMinor: 5000,
        capMinor: 3000,
      } as any;

      expect(resolver.resolveAmountRs(fine)).toBe(30);
      expect(resolver.resolvePaidRs(fine)).toBe(10);
      expect(resolver.resolveOutstandingMinor(fine)).toBe(2000);
      expect(resolver.resolveOutstandingRs(fine)).toBe(20);
      expect(resolver.resolveUncappedAmountRs(fine)).toBe(50);
      expect(resolver.resolveCapRs(fine)).toBe(30);
      expect(resolver.resolveWasCapped(fine)).toBe(true);

      const uncappedFine = {
        id: 2,
        amountMinor: 2000,
        paidMinor: 0,
        uncappedAmountMinor: null,
        capMinor: null,
      } as any;
      expect(resolver.resolveUncappedAmountRs(uncappedFine)).toBeNull();
      expect(resolver.resolveCapRs(uncappedFine)).toBeNull();
      expect(resolver.resolveWasCapped(uncappedFine)).toBe(false);

      prismaMock.finePayment.findMany.mockResolvedValueOnce([
        {
          id: 1,
          fineId: 1,
          amountMinor: 1000,
          receivedById: 2,
          createdAt: fixedNow,
        },
      ]);

      const payments = await resolver.resolvePayments(fine);
      expect(payments).toHaveLength(1);
      expect(payments[0].amountRs).toBe(10);
    });

    it('resolves bookTitle for MyFineModel using FinesDataLoader', async () => {
      finesDataLoaderMock.loadBookTitleForLoan.mockResolvedValueOnce(
        'Domain-Driven Design',
      );

      const title = await myFineResolver.resolveBookTitle({
        id: 1,
        loanId: 10,
      } as any);

      expect(finesDataLoaderMock.loadBookTitleForLoan).toHaveBeenCalledWith(10);
      expect(title).toBe('Domain-Driven Design');
    });
  });
});
