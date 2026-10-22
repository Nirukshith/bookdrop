import { Field, InputType, Int } from '@nestjs/graphql';
import { HoldStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

@InputType('HoldFilterInput')
export class HoldFilterInput {
  @Field(() => HoldStatus, { nullable: true })
  @IsOptional()
  @IsEnum(HoldStatus)
  status?: HoldStatus;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  userId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  bookId?: number;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  expiringBefore?: Date;
}

@InputType('HoldsPaginationInput')
export class HoldsPaginationInput {
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
