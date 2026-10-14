import { NotFoundException } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import { Role } from '@prisma/client';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { UpdateUserRoleArgs } from './dto/update-user-role.args';
import { UserModel } from './models/user.model';
import { UsersService } from './users.service';

@Resolver(() => UserModel)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => UserModel, { name: 'me' })
  async me(@CurrentUser() user: AuthenticatedUser): Promise<UserModel> {
    const foundUser = await this.usersService.findById(user.sub);
    if (!foundUser) {
      throw new NotFoundException('User not found');
    }
    return foundUser;
  }

  @Query(() => [UserModel], { name: 'users' })
  @Roles(Role.ADMIN)
  async users(): Promise<UserModel[]> {
    return this.usersService.list();
  }

  @Mutation(() => UserModel, { name: 'updateUserRole' })
  @Roles(Role.ADMIN)
  async updateUserRole(
    @Args() args: UpdateUserRoleArgs,
    @CurrentUser() currentUser: AuthenticatedUser,
  ): Promise<UserModel> {
    return this.usersService.updateRole(
      currentUser.sub,
      args.userId,
      args.role,
    );
  }
}
