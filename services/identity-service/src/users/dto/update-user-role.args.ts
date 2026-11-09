import { ArgsType, Field, Int } from '@nestjs/graphql';
import { Role } from '@prisma/client';

@ArgsType()
export class UpdateUserRoleArgs {
  @Field(() => Int)
  userId: number;

  @Field(() => Role)
  role: Role;
}

