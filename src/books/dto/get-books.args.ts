import { ArgsType, Field, Int } from '@nestjs/graphql';

@ArgsType()
export class GetBooksArgs {
  @Field({ nullable: true })
  search?: string;

  @Field(() => Int, { nullable: true })
  categoryId?: number;

  @Field(() => Int, { nullable: true })
  authorId?: number;

  @Field(() => Int, { defaultValue: 10, nullable: true })
  take: number = 10;

  @Field(() => Int, { defaultValue: 0, nullable: true })
  skip: number = 0;
}
