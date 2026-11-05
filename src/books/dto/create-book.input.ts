import { Field, Float, InputType, Int } from '@nestjs/graphql';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

@InputType()
export class CreateBookInput {
  @Field()
  @IsString()
  @IsNotEmpty()
  title: string;

  @Field()
  @IsString()
  @IsNotEmpty()
  isbn: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  description?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  publishedYear?: number;

  @Field(() => Float, {
    nullable: true,
    description: 'Replacement price in Rupees (at most 2 decimals)',
  })
  @IsOptional()
  @IsNumber()
  priceRs?: number;

  @Field(() => [Int])
  @IsArray()
  @IsInt({ each: true })
  @ArrayNotEmpty()
  authorIds: number[];

  @Field(() => [Int])
  @IsArray()
  @IsInt({ each: true })
  @ArrayNotEmpty()
  categoryIds: number[];
}
