import { Field, InputType } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

@InputType()
export class LoginInput {
  @Field()
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @Field()
  @IsString()
  @IsNotEmpty({ message: 'Password must not be empty' })
  password: string;
}
