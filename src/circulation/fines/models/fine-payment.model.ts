import { Field, ID, Int, Float, ObjectType } from '@nestjs/graphql';

@ObjectType('FinePayment')
export class FinePaymentModel {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  fineId: number;

  @Field(() => Int)
  amountMinor: number;

  @Field(() => Float, { description: 'Payment amount in Rupees' })
  amountRs: number;

  @Field(() => Int, { description: 'Staff user ID who received the payment' })
  receivedById: number;

  @Field(() => String, { nullable: true })
  note?: string | null;

  @Field(() => Date)
  createdAt: Date;
}

