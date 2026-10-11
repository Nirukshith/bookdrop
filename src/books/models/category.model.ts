import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Category')
export class CategoryModel {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;
}
