import { ArgsType, Field, Int } from '@nestjs/graphql';
import { IsEnum, IsInt, IsPositive } from 'class-validator';
import { Role } from '@prisma/client';

@ArgsType()
export class UpdateUserRoleArgs {
  @Field(() => Int)
  @IsInt()
  @IsPositive()
  userId: number;

  @Field(() => Role)
  @IsEnum(Role)
  role: Role;
}
