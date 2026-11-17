import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType('Author')
export class AuthorModel {
  @Field(() => ID)
  id: number;

  @Field()
  name: string;
}
