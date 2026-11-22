import { Injectable } from '@nestjs/common';
import { LoanStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ActiveLoanCountPort } from './active-loan-count.port';

/**
 * Real implementation of ActiveLoanCountPort for Stage 6.
 * Counts currently ACTIVE loans for a given member in PostgreSQL.
 */
@Injectable()
export class DefaultActiveLoanCountAdapter implements ActiveLoanCountPort {
  constructor(private readonly prisma: PrismaService) {}

  async countActiveLoansForMember(
    userId: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx ?? this.prisma;
    return client.loan.count({
      where: {
        userId,
        status: LoanStatus.ACTIVE,
      },
    });
  }
}
