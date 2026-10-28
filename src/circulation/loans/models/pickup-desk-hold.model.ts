import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('PickupDeskHold')
export class PickupDeskHoldModel {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  userId: number;

  @Field(() => String, {
    description: 'Member name resolved via Identity DataLoader',
  })
  memberName: string;

  @Field(() => Int)
  bookId: number;

  @Field(() => String, {
    description: 'Book title resolved via Catalog DataLoader',
  })
  bookTitle: string;

  @Field(() => Int)
  copyId: number;

  @Field(() => String, {
    description: 'Physical copy barcode to verify at desk',
  })
  copyBarcode: string;

  @Field(() => Date, {
    description: 'Pickup deadline in UTC',
  })
  pickupDeadline: Date;

  @Field(() => Date)
  createdAt: Date;
}
