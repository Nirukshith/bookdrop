import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { CopyStatus } from '@prisma/client';

@ObjectType('CopyStatusHistory')
export class CopyStatusHistoryModel {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  copyId: number;

  @Field(() => CopyStatus, { nullable: true })
  fromStatus?: CopyStatus | null;

  @Field(() => CopyStatus)
  toStatus: CopyStatus;

  @Field(() => String, { nullable: true })
  reason?: string | null;

  @Field(() => Int, { nullable: true })
  changedById?: number | null;

  @Field(() => Date)
  createdAt: Date;
}
