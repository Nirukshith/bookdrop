import {
  Field,
  ID,
  Int,
  Float,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { FineReason, FineStatus } from '@prisma/client';
import { FinePaymentModel } from './fine-payment.model';

registerEnumType(FineReason, {
  name: 'FineReason',
  description: 'Reason for the assessment of a circulation fine',
});

registerEnumType(FineStatus, {
  name: 'FineStatus',
  description: 'Lifecycle statuses of a circulation fine',
});

@ObjectType('Fine')
export class FineModel {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  userId: number;

  @Field(() => FineReason)
  reason: FineReason;

  @Field(() => Int)
  amountMinor: number;

  @Field(() => Float, { description: 'Original fine amount in Rupees' })
  amountRs: number;

  @Field(() => Int)
  paidMinor: number;

  @Field(() => Float, { description: 'Paid amount in Rupees' })
  paidRs: number;

  @Field(() => Int, { description: 'Outstanding balance in minor units' })
  outstandingMinor: number;

  @Field(() => Float, { description: 'Outstanding balance in Rupees' })
  outstandingRs: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Uncapped fine amount in Rupees before cap was applied',
  })
  uncappedAmountRs?: number | null;

  @Field(() => Float, {
    nullable: true,
    description: 'Applied cap in Rupees (book price or global cap)',
  })
  capRs?: number | null;

  @Field(() => Boolean, {
    description:
      'Dynamically evaluated: true if fine was capped (amountMinor < uncappedAmountMinor)',
  })
  wasCapped: boolean;

  @Field(() => FineStatus)
  status: FineStatus;

  @Field(() => Int, { nullable: true })
  loanId?: number | null;

  @Field(() => Int, { nullable: true })
  daysLate?: number | null;

  @Field(() => String, { nullable: true })
  note?: string | null;

  @Field(() => String, { nullable: true })
  dedupeKey?: string | null;

  @Field(() => Int, { nullable: true })
  createdById?: number | null;

  @Field(() => Int, { nullable: true })
  waivedById?: number | null;

  @Field(() => String, { nullable: true })
  waivedReason?: string | null;

  @Field(() => Date, { nullable: true })
  settledAt?: Date | null;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => [FinePaymentModel], {
    description: 'Payment ledger records associated with this fine',
  })
  payments?: FinePaymentModel[];
}
