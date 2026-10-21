import { Field, InputType } from '@nestjs/graphql';
import { IsOptional, IsString } from 'class-validator';

@InputType()
export class UpdateCopyInput {
  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  shelfLocation?: string;

  @Field(() => String, { nullable: true })
  @IsOptional()
  @IsString()
  notes?: string;
}
