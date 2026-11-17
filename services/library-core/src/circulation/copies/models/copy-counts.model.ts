import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('CopyCounts')
export class CopyCountsModel {
  @Field(() => Int)
  total: number;

  @Field(() => Int)
  available: number;

  @Field(() => Int)
  onHold: number;

  @Field(() => Int)
  borrowed: number;

  @Field(() => Int)
  lost: number;

  @Field(() => Int)
  damaged: number;
}
