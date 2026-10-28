import { Field, InputType, Int } from '@nestjs/graphql';
import { LoanStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

@InputType('LoanFilterInput')
export class LoanFilterInput {
  @Field(() => LoanStatus, { nullable: true })
  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  userId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  bookId?: number;

  @Field(() => Boolean, { nullable: true })
  @IsOptional()
  @IsBoolean()
  overdue?: boolean;

  @Field(() => Date, { nullable: true })
  @IsOptional()
  dueBefore?: Date;
}

@InputType('LoanPaginationInput')
export class LoanPaginationInput {
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
