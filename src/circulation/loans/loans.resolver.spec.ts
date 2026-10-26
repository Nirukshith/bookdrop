import { Test, TestingModule } from '@nestjs/testing';
import { HoldStatus, Loan, LoanStatus, Role } from '@prisma/client';
import { AuthenticatedUser } from '../../auth';
import { PrismaService } from '../../prisma/prisma.service';
import { ClockService } from '../../common/clock/clock.service';
import { CopiesService } from '../copies/copies.service';
import { IDENTITY_PUBLIC_API } from '../../users';
import { LoansService } from './loans.service';
import { LoansDataLoader } from './loans.loader';
import { LoansResolver } from './loans.resolver';
import { MemberNotFoundError } from './errors';

describe('LoansResolver (Step 6)', () => {
  let resolver: LoansResolver;
  let loansServiceMock: any;
  let copiesServiceMock: any;
  let prismaMock: any;
  let clockServiceMock: any;
  let identityPublicApiMock: any;
  let loansDataLoaderMock: any;

  const fixedNow = new Date('2026-10-26T10:00:00.000Z');
  const staffUser: AuthenticatedUser = {
    sub: 999,
    email: 'staff@example.com',
    role: Role.LIBRARIAN,
  };
  const memberUser: AuthenticatedUser = {
    sub: 42,
    email: 'member@example.com',
    role: Role.MEMBER,
  };

  beforeEach(async () => {
    loansServiceMock = {
      confirmPickup: jest.fn(),
      checkoutCopy: jest.fn(),
      listStaffLoans: jest.fn(),
      listMemberLoans: jest.fn(),
      getLoan: jest.fn(),
      isOverdue: jest.fn(),
    };

    copiesServiceMock = {
      findById: jest.fn(),
    };

    prismaMock = {
      hold: {
        findMany: jest.fn(),
      },
      copy: {
        findUnique: jest.fn(),
      },
    };

    clockServiceMock = {
      now: jest.fn().mockReturnValue(new Date(fixedNow)),
    };

    identityPublicApiMock = {
      findMemberByEmail: jest.fn(),
      getMembersByIds: jest.fn(),
    };

    loansDataLoaderMock = {
      loadBookTitle: jest.fn().mockResolvedValue('The Great Gatsby'),
      loadMemberName: jest.fn().mockResolvedValue('Alice Member'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoansResolver,
        { provide: LoansService, useValue: loansServiceMock },
        { provide: CopiesService, useValue: copiesServiceMock },
        { provide: PrismaService, useValue: prismaMock },
        { provide: ClockService, useValue: clockServiceMock },
        { provide: IDENTITY_PUBLIC_API, useValue: identityPublicApiMock },
        { provide: LoansDataLoader, useValue: loansDataLoaderMock },
      ],
    }).compile();

    resolver = module.get<LoansResolver>(LoansResolver);
  });

  describe('pickupDeskHolds', () => {
    const activeHold = {
      id: 10,
      userId: 42,
      bookId: 101,
      copyId: 5,
      status: HoldStatus.ACTIVE,
      expiresAt: new Date('2026-10-27T10:00:00.000Z'),
      createdAt: new Date('2026-10-26T10:00:00.000Z'),
      copy: {
        barcode: 'BD-000005',
      },
    };

    it('returns active holds with memberName and bookTitle resolved via DataLoader', async () => {
      prismaMock.hold.findMany.mockResolvedValue([activeHold]);

      const results = await resolver.pickupDeskHolds();

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({
        id: 10,
        userId: 42,
        memberName: 'Alice Member',
        bookId: 101,
        bookTitle: 'The Great Gatsby',
        copyId: 5,
        copyBarcode: 'BD-000005',
        pickupDeadline: activeHold.expiresAt,
        createdAt: activeHold.createdAt,
      });

      expect(loansDataLoaderMock.loadMemberName).toHaveBeenCalledWith(42);
      expect(loansDataLoaderMock.loadBookTitle).toHaveBeenCalledWith(101);
    });

    it('filters holds by memberEmail when provided', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValue({
        id: 42,
        name: 'Alice',
      });
      prismaMock.hold.findMany.mockResolvedValue([activeHold]);

      const results = await resolver.pickupDeskHolds('alice@example.com');

      expect(identityPublicApiMock.findMemberByEmail).toHaveBeenCalledWith(
        'alice@example.com',
      );
      expect(prismaMock.hold.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: HoldStatus.ACTIVE,
            userId: 42,
          },
        }),
      );
      expect(results).toHaveLength(1);
    });

    it('returns empty array if memberEmail does not match any member', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValue(null);

      const results = await resolver.pickupDeskHolds('nonexistent@example.com');
      expect(results).toEqual([]);
      expect(prismaMock.hold.findMany).not.toHaveBeenCalled();
    });

    it('filters holds by copyBarcode when provided', async () => {
      prismaMock.copy.findUnique.mockResolvedValue({ id: 5 });
      prismaMock.hold.findMany.mockResolvedValue([activeHold]);

      const results = await resolver.pickupDeskHolds(undefined, 'BD-000005');

      expect(prismaMock.copy.findUnique).toHaveBeenCalledWith({
        where: { barcode: 'BD-000005' },
      });
      expect(prismaMock.hold.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: HoldStatus.ACTIVE,
            copyId: 5,
          },
        }),
      );
      expect(results).toHaveLength(1);
    });

    it('returns empty array if copyBarcode does not exist', async () => {
      prismaMock.copy.findUnique.mockResolvedValue(null);

      const results = await resolver.pickupDeskHolds(undefined, 'UNKNOWN');
      expect(results).toEqual([]);
      expect(prismaMock.hold.findMany).not.toHaveBeenCalled();
    });
  });

  describe('confirmPickup', () => {
    it('delegates to loansService.confirmPickup with staff actor ID', async () => {
      const mockLoan = { id: 1 } as Loan;
      loansServiceMock.confirmPickup.mockResolvedValue(mockLoan);

      const result = await resolver.confirmPickup(10, 'BD-000005', staffUser);

      expect(loansServiceMock.confirmPickup).toHaveBeenCalledWith(
        10,
        'BD-000005',
        staffUser.sub,
      );
      expect(result).toBe(mockLoan);
    });
  });

  describe('checkoutCopy', () => {
    it('resolves member by email and delegates to loansService.checkoutCopy', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValue({
        id: 42,
        email: 'member@example.com',
      });
      const mockLoan = { id: 2 } as Loan;
      loansServiceMock.checkoutCopy.mockResolvedValue(mockLoan);

      const result = await resolver.checkoutCopy(
        'member@example.com',
        'BD-000005',
        staffUser,
      );

      expect(identityPublicApiMock.findMemberByEmail).toHaveBeenCalledWith(
        'member@example.com',
      );
      expect(loansServiceMock.checkoutCopy).toHaveBeenCalledWith(
        42,
        'BD-000005',
        staffUser.sub,
      );
      expect(result).toBe(mockLoan);
    });

    it('throws MemberNotFoundError if memberEmail is unknown', async () => {
      identityPublicApiMock.findMemberByEmail.mockResolvedValue(null);

      await expect(
        resolver.checkoutCopy('unknown@example.com', 'BD-000005', staffUser),
      ).rejects.toThrow(MemberNotFoundError);

      expect(loansServiceMock.checkoutCopy).not.toHaveBeenCalled();
    });
  });

  describe('loans and loan', () => {
    it('loans delegates to loansService.listStaffLoans and returns items', async () => {
      const mockLoans = [{ id: 1 }, { id: 2 }] as Loan[];
      loansServiceMock.listStaffLoans.mockResolvedValue({
        items: mockLoans,
        total: 2,
      });

      const results = await resolver.loans({ status: LoanStatus.ACTIVE });

      expect(loansServiceMock.listStaffLoans).toHaveBeenCalledWith(
        { status: LoanStatus.ACTIVE },
        undefined,
      );
      expect(results).toEqual(mockLoans);
    });

    it('loan delegates to loansService.getLoan', async () => {
      const mockLoan = { id: 1 } as Loan;
      loansServiceMock.getLoan.mockResolvedValue(mockLoan);

      const result = await resolver.loan(1);
      expect(loansServiceMock.getLoan).toHaveBeenCalledWith(1);
      expect(result).toBe(mockLoan);
    });
  });

  describe('myLoans', () => {
    it('delegates to loansService.listMemberLoans with current user ID', async () => {
      const mockLoans = [{ id: 1, userId: memberUser.sub }] as Loan[];
      loansServiceMock.listMemberLoans.mockResolvedValue(mockLoans);

      const results = await resolver.myLoans(memberUser, LoanStatus.ACTIVE);

      expect(loansServiceMock.listMemberLoans).toHaveBeenCalledWith(
        memberUser.sub,
        LoanStatus.ACTIVE,
      );
      expect(results).toEqual(mockLoans);
    });
  });

  describe('Field Resolvers', () => {
    const loan = {
      id: 1,
      bookId: 101,
      copyId: 5,
      status: LoanStatus.ACTIVE,
      dueAt: new Date('2026-10-29T23:59:59.999Z'),
      copy: { barcode: 'BD-000005' },
    } as any;

    it('resolveBookTitle delegates to DataLoader', async () => {
      const title = await resolver.resolveBookTitle(loan);
      expect(title).toBe('The Great Gatsby');
      expect(loansDataLoaderMock.loadBookTitle).toHaveBeenCalledWith(101);
    });

    it('resolveCopyBarcode returns barcode for staff and null for members', async () => {
      // Member request: redacted
      const forMember = await resolver.resolveCopyBarcode(loan, memberUser);
      expect(forMember).toBeNull();

      // Staff request: visible
      const forStaff = await resolver.resolveCopyBarcode(loan, staffUser);
      expect(forStaff).toBe('BD-000005');
    });

    it('resolveIsOverdue delegates to loansService.isOverdue', () => {
      loansServiceMock.isOverdue.mockReturnValue(true);
      expect(resolver.resolveIsOverdue(loan)).toBe(true);
      expect(loansServiceMock.isOverdue).toHaveBeenCalledWith(loan);
    });

    it('resolveDaysRemaining calculates positive days before dueAt, and 0 when overdue', () => {
      // Due in 3 days (fixedNow is 2026-10-26T10:00:00Z, dueAt is 2026-10-29T23:59:59.999Z)
      const remaining = resolver.resolveDaysRemaining(loan);
      expect(remaining).toBe(4); // ceil of ~3.58 days

      // When overdue
      const overdueLoan = {
        ...loan,
        dueAt: new Date('2026-10-25T10:00:00.000Z'),
      };
      expect(resolver.resolveDaysRemaining(overdueLoan)).toBe(0);

      // When returned
      const returnedLoan = {
        ...loan,
        status: LoanStatus.RETURNED,
      };
      expect(resolver.resolveDaysRemaining(returnedLoan)).toBe(0);
    });

    it('resolveDaysLate calculates positive days when overdue, and 0 when on-time', () => {
      // On-time
      expect(resolver.resolveDaysLate(loan)).toBe(0);

      // Overdue by 1 day (fixedNow is 2026-10-26T10:00:00Z, dueAt is 2026-10-25T10:00:00.000Z)
      const overdueLoan = {
        ...loan,
        dueAt: new Date('2026-10-25T10:00:00.000Z'),
      };
      expect(resolver.resolveDaysLate(overdueLoan)).toBe(1);

      // Returned loan is never late
      const returnedLoan = {
        ...loan,
        status: LoanStatus.RETURNED,
        dueAt: new Date('2026-10-25T10:00:00.000Z'),
      };
      expect(resolver.resolveDaysLate(returnedLoan)).toBe(0);
    });
  });
});
