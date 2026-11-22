import {
  Directive,
  Field,
  ID,
  ObjectType,
  registerEnumType,
} from '@nestjs/graphql';
import { MembershipStatus, Role } from '@prisma/client';

registerEnumType(Role, {
  name: 'Role',
  description: 'User access roles within Bookdrop',
});

registerEnumType(MembershipStatus, {
  name: 'MembershipStatus',
  description:
    'Approval state of a library membership. Only APPROVED members may place holds, join waitlists or borrow.',
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

  @Field(() => String, {
    nullable: true,
    description: 'Library card number supplied at registration',
  })
  membershipNumber?: string | null;

  @Field(() => MembershipStatus)
  membershipStatus: MembershipStatus;

  @Field(() => Date, { nullable: true })
  membershipReviewedAt?: Date | null;

  @Field(() => Date)
  @Directive('@shareable')
  createdAt: Date;

  @Field(() => Date)
  @Directive('@shareable')
  updatedAt: Date;
}
