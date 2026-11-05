import { Injectable } from '@nestjs/common';
import { FineStatus, LoanStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ClockService } from '../../../common/clock/clock.service';
import { UnpaidFinesCheckResult, UnpaidFinesPort } from './unpaid-fines.port';

/**
 * Real implementation of UnpaidFinesPort for Stage 7.
 * Evaluates whether a patron is blocked due to:
 * 1. UNPAID_FINES: Any fine with status UNPAID or PARTIALLY_PAID (WAIVED and PAID never block).
 * 2. OVERDUE_LOANS: Any ACTIVE loan where current time > dueAt (accruing late fees).
 */
@Injectable()
export class DefaultUnpaidFinesAdapter implements UnpaidFinesPort {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clockService: ClockService,
  ) {}

  async checkMemberFines(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<UnpaidFinesCheckResult> {
    const client = tx ?? this.prisma;

    // 1. Check for any UNPAID or PARTIALLY_PAID fines
    const unpaidFine = await client.fine.findFirst({
      where: {
        userId,
        status: { in: [FineStatus.UNPAID, FineStatus.PARTIALLY_PAID] },
      },
      select: { id: true },
    });

    if (unpaidFine) {
      return { blocked: true, reason: 'UNPAID_FINES' };
    }

    // 2. Check for any ACTIVE overdue loans
    const now = this.clockService.now();
    const overdueLoan = await client.loan.findFirst({
      where: {
        userId,
        status: LoanStatus.ACTIVE,
        dueAt: { lt: now },
      },
      select: { id: true },
    });

    if (overdueLoan) {
      return { blocked: true, reason: 'OVERDUE_LOANS' };
    }

    return { blocked: false };
  }

  async hasUnpaidFines(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const result = await this.checkMemberFines(userId, tx);
    return result.blocked;
  }
}
