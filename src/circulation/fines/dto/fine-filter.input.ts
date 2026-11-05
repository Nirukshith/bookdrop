import { Field, InputType, Int } from '@nestjs/graphql';
import { FineReason, FineStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

@InputType('FineFilterInput')
export class FineFilterInput {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  userId?: number;

  @Field(() => FineStatus, { nullable: true })
  @IsOptional()
  @IsEnum(FineStatus)
  status?: FineStatus;

  @Field(() => FineReason, { nullable: true })
  @IsOptional()
  @IsEnum(FineReason)
  reason?: FineReason;
}

@InputType('FinePaginationInput')
export class FinePaginationInput {
  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @Min(0)
  skip: number = 0;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  @Min(1)
  @Max(100)
  take: number = 20;
}
