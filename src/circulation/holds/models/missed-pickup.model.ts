import {
  Field,
  ID,
  Int,
  ObjectType,
  GraphQLISODateTime,
} from '@nestjs/graphql';

@ObjectType('RecentMissedPickup')
export class RecentMissedPickupModel {
  @Field(() => ID)
  id: number;

  @Field(() => Int)
  holdId: number;

  @Field(() => Int)
  bookId: number;

  @Field(() => String, { nullable: true })
  bookTitle?: string;

  @Field(() => GraphQLISODateTime)
  missedAt: Date;

  @Field(() => Boolean)
  excused: boolean;

  @Field(() => String, { nullable: true })
  excusedReason?: string | null;
}

@ObjectType('MissedPickupsSummary')
export class MissedPickupsSummaryModel {
  @Field(() => Int)
  unassessedCount: number;

  @Field(() => Int)
  threshold: number;

  @Field(() => [RecentMissedPickupModel])
  recent: RecentMissedPickupModel[];
}
