import {
  Directive,
  Field,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { Role } from '@prisma/client';

registerEnumType(Role, {
  name: 'Role',
  description: 'User access roles within Bookdrop',
});

@ObjectType('User')
@Directive('@key(fields: "id")')
@Directive('@shareable')
export class UserModel {
  @Field(() => ID)
  id: number;

  @Field()
  @Directive('@shareable')
  name: string;

  @Field()
  @Directive('@shareable')
  email: string;

  @Field(() => Role)
  @Directive('@shareable')
  role: Role;

  @Field(() => Date)
  @Directive('@shareable')
  createdAt: Date;

  @Field(() => Date)
  @Directive('@shareable')
  updatedAt: Date;
}
