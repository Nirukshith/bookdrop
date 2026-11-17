import { Directive, Field, Float, ID, Int, ObjectType } from '@nestjs/graphql';
import { AuthorModel } from './author.model';
import { CategoryModel } from './category.model';

@ObjectType('Book')
@Directive('@key(fields: "id")')
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

  @Field(() => Float, {
    nullable: true,
    description: 'Replacement price in Rupees (null if not set)',
  })
  replacementPriceRs?: number | null;

  priceMinor?: number | null;

  @Field(() => [AuthorModel])
  authors: AuthorModel[];

  @Field(() => [CategoryModel])
  categories: CategoryModel[];

  @Field(() => Int)
  availableCopiesCount: number;

  @Field(() => Int)
  availableCopies: number;

  @Field(() => Date)
  createdAt: Date;
}
