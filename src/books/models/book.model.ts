import { Field, ID, Int, ObjectType } from '@nestjs/graphql';
import { AuthorModel } from './author.model';
import { CategoryModel } from './category.model';

@ObjectType('Book')
export class BookModel {
  @Field(() => ID)
  id: number;

  @Field()
  title: string;

  @Field()
  isbn: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Int, { nullable: true })
  publishedYear?: number;

  @Field(() => [AuthorModel])
  authors: AuthorModel[];

  @Field(() => [CategoryModel])
  categories: CategoryModel[];

  @Field(() => Int)
  availableCopiesCount: number;

  @Field(() => Date)
  createdAt: Date;
}
