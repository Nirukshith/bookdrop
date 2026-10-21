import { ArgsType, Field, Int } from '@nestjs/graphql';
import { CopyStatus } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

@ArgsType()
export class CopiesFilterArgs {
  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  bookId?: number;

  @Field(() => CopyStatus, { nullable: true })
  @IsOptional()
  @IsEnum(CopyStatus)
  status?: CopyStatus;

  @Field(() => Boolean, { nullable: true, defaultValue: false })
  @IsOptional()
  @IsBoolean()
  includeRetired?: boolean = false;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number = 0;

  @Field(() => Int, { nullable: true, defaultValue: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number = 20;
}
