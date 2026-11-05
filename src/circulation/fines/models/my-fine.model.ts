import { Field, ID, Float, ObjectType } from '@nestjs/graphql';
import { FineReason, FineStatus } from '@prisma/client';

@ObjectType('MyFine')
export class MyFineModel {
  @Field(() => ID)
  id: number;

  @Field(() => FineReason)
  reason: FineReason;

  @Field(() => Float, { description: 'Original fine amount in Rupees' })
  originalAmountRs: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Alias for originalAmountRs',
  })
  amountRs?: number;

  @Field(() => Float, { description: 'Paid amount in Rupees' })
  paidAmountRs: number;

  @Field(() => Float, { nullable: true, description: 'Alias for paidAmountRs' })
  paidRs?: number;

  @Field(() => Float, { description: 'Outstanding balance in Rupees' })
  outstandingAmountRs: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Alias for outstandingAmountRs',
  })
  outstandingRs?: number;

  @Field(() => FineStatus)
  status: FineStatus;

  @Field(() => String, {
    nullable: true,
    description: 'Related book title (batched via Catalog DataLoader)',
  })
  bookTitle?: string | null;

  @Field(() => Date, { nullable: true })
  createdAt?: Date;

  // Internal loanId used solely by DataLoader to resolve bookTitle (not exposed in GraphQL)
  loanId?: number | null;
}

