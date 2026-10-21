import { Field, InputType, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

@InputType()
export class AddCopyInput {
  @Field(() => Int)
  @IsInt()
  @Min(1)
  bookId: number;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  barcode?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  shelfLocation?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
