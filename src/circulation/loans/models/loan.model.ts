import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { LoanStatus } from '@prisma/client';

registerEnumType(LoanStatus, {
  name: 'LoanStatus',
  description: 'Lifecycle statuses for physical copy loans',
});

@ObjectType('Loan')
export class LoanModel {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  userId: number;

  @Field(() => Int)
  bookId: number;

  @Field(() => String, {
    description:
      'Book title resolved via Catalog DataLoader (single batched query)',
  })
  bookTitle?: string;

  @Field(() => Int)
  copyId: number;

  @Field(() => String, {
    nullable: true,
    description: 'Physical copy barcode (Staff only; hidden from members)',
  })
  copyBarcode?: string | null;

  @Field(() => Int, { nullable: true })
  holdId?: number | null;

  @Field(() => LoanStatus)
  status: LoanStatus;

  @Field(() => Date)
  borrowedAt: Date;

  @Field(() => Date)
  dueAt: Date;

  @Field(() => Date, { nullable: true })
  returnedAt?: Date | null;

  @Field(() => Boolean, {
    description:
      'Dynamically evaluated based on clock time: status === ACTIVE && now > dueAt',
  })
  isOverdue?: boolean;

  @Field(() => Int, {
    description: 'Days remaining until dueAt, or 0 if overdue/returned',
  })
  daysRemaining?: number;

  @Field(() => Int, {
    description: 'Days late past dueAt if overdue, or 0 if on-time/returned',
  })
  daysLate?: number;

  @Field(() => Int)
  checkedOutById: number;

  @Field(() => Int, { nullable: true })
  returnedById?: number | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}
