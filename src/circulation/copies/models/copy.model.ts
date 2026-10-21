import { Field, ID, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { CopyStatus } from '@prisma/client';

registerEnumType(CopyStatus, {
  name: 'CopyStatus',
  description: 'Lifecycle statuses for physical book copies',
});

@ObjectType('Copy')
export class CopyModel {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  bookId: number;

  @Field()
  barcode: string;

  @Field(() => CopyStatus)
  status: CopyStatus;

  @Field(() => String, { nullable: true })
  shelfLocation?: string | null;

  @Field(() => String, { nullable: true })
  notes?: string | null;

  @Field(() => Date, { nullable: true })
  retiredAt?: Date | null;

  @Field(() => Date)
  createdAt: Date;

  @Field(() => Date)
  updatedAt: Date;
}
