import { Field, InputType, Int } from '@nestjs/graphql';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
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
