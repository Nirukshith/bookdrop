import { Field, ObjectType } from '@nestjs/graphql';
import { UserModel } from '../../users/models/user.model';

@ObjectType('AuthPayload')
export class AuthPayloadModel {
  @Field()
  accessToken: string;

  @Field()
  refreshToken: string;

  @Field(() => UserModel)
  user: UserModel;
}
