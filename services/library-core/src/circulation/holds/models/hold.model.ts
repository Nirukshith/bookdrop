import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { HoldSource, HoldStatus } from '@prisma/client';

registerEnumType(HoldStatus, {
  name: 'HoldStatus',
  description: 'Lifecycle statuses for book reservation holds',
});

registerEnumType(HoldSource, {
  name: 'HoldSource',
  description: 'Source or mechanism that originated the hold request',
});

@ObjectType('Hold')
export class HoldModel {
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

  @Field(() => HoldStatus)
  status: HoldStatus;

  @Field(() => HoldSource)
  source: HoldSource;

  @Field(() => Date, { description: 'Pickup deadline in UTC' })
  expiresAt: Date;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date, { nullable: true })
  resolvedAt?: Date | null;

  @Field(() => String, { nullable: true })
  resolvedNote?: string | null;
}
