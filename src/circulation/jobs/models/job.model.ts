import { Field, Int, ObjectType, GraphQLISODateTime } from '@nestjs/graphql';

@ObjectType('JobStatus')
export class JobStatusModel {
  @Field(() => String)
  name: string;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastStartedAt?: Date | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lastFinishedAt?: Date | null;

  @Field(() => String, { nullable: true })
  lastStatus?: string | null;

  @Field(() => String, { nullable: true })
  lastError?: string | null;

  @Field(() => String, { nullable: true })
  lastStats?: string | null;

  @Field(() => Boolean)
  isLeased: boolean;

  @Field(() => String, { nullable: true })
  lockedBy?: string | null;

  @Field(() => GraphQLISODateTime, { nullable: true })
  lockedUntil?: Date | null;
}

@ObjectType('JobRunResult')
export class JobRunResultModel {
  @Field(() => String)
  jobName: string;

  @Field(() => Boolean)
  skipped: boolean;

  @Field(() => String)
  status: string;

  @Field(() => Int)
  durationMs: number;

  @Field(() => String, { nullable: true })
  error?: string | null;

  @Field(() => String, { nullable: true })
  stats?: string | null;
}

