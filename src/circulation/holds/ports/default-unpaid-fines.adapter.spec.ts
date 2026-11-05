import { FineStatus, LoanStatus } from '@prisma/client';
import { DefaultUnpaidFinesAdapter } from './default-unpaid-fines.adapter';
import { ClockService } from '../../../common/clock/clock.service';

describe('DefaultUnpaidFinesAdapter (Unit Tests)', () => {
  let adapter: DefaultUnpaidFinesAdapter;
  let prismaMock: any;
  let clockServiceMock: jest.Mocked<ClockService>;

  const fixedNow = new Date('2026-11-04T12:00:00.000Z');

  beforeEach(() => {
    prismaMock = {
      fine: {
        findFirst: jest.fn(),
      },
      loan: {
        findFirst: jest.fn(),
      },
    };

    clockServiceMock = {
      now: jest.fn().mockReturnValue(fixedNow),
    } as unknown as jest.Mocked<ClockService>;

    adapter = new DefaultUnpaidFinesAdapter(prismaMock, clockServiceMock);
  });

  it('returns blocked with UNPAID_FINES when member has an UNPAID or PARTIALLY_PAID fine', async () => {
    prismaMock.fine.findFirst.mockResolvedValueOnce({ id: 1 });

    const result = await adapter.checkMemberFines(42);

    expect(result).toEqual({ blocked: true, reason: 'UNPAID_FINES' });
    expect(prismaMock.fine.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 42,
        status: { in: [FineStatus.UNPAID, FineStatus.PARTIALLY_PAID] },
      },
      select: { id: true },
    });
    expect(prismaMock.loan.findFirst).not.toHaveBeenCalled();
  });

  it('returns blocked with OVERDUE_LOANS when member has an active overdue loan and no unpaid fines', async () => {
    prismaMock.fine.findFirst.mockResolvedValueOnce(null);
    prismaMock.loan.findFirst.mockResolvedValueOnce({ id: 99 });

    const result = await adapter.checkMemberFines(42);

    expect(result).toEqual({ blocked: true, reason: 'OVERDUE_LOANS' });
    expect(prismaMock.loan.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 42,
        status: LoanStatus.ACTIVE,
        dueAt: { lt: fixedNow },
      },
      select: { id: true },
    });
  });

  it('prefers UNPAID_FINES when member has BOTH unpaid fines and overdue loans', async () => {
    prismaMock.fine.findFirst.mockResolvedValueOnce({ id: 1 });
    prismaMock.loan.findFirst.mockResolvedValueOnce({ id: 99 });

    const result = await adapter.checkMemberFines(42);

    expect(result).toEqual({ blocked: true, reason: 'UNPAID_FINES' });
  });

  it('returns blocked: false when member has neither unpaid fines nor overdue loans', async () => {
    prismaMock.fine.findFirst.mockResolvedValueOnce(null);
    prismaMock.loan.findFirst.mockResolvedValueOnce(null);

    const result = await adapter.checkMemberFines(42);

    expect(result).toEqual({ blocked: false });
  });

  it('hasUnpaidFines returns true when blocked, false when unblocked', async () => {
    prismaMock.fine.findFirst.mockResolvedValueOnce({ id: 1 });
    expect(await adapter.hasUnpaidFines(42)).toBe(true);

    prismaMock.fine.findFirst.mockResolvedValueOnce(null);
    prismaMock.loan.findFirst.mockResolvedValueOnce(null);
    expect(await adapter.hasUnpaidFines(42)).toBe(false);
  });
});
