import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

@ArgsType()
export class GetBooksArgs {
  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  search?: string;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @Field(() => Int, { nullable: true })
  @IsOptional()
  @IsInt()
  authorId?: number;

  @Field(() => Int, { defaultValue: 10, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  take?: number = 10;

  @Field(() => Int, { defaultValue: 0, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  skip?: number = 0;
}
