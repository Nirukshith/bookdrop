import { Field, InputType } from '@nestjs/graphql';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

/** Library card numbers: 4–32 letters, digits or hyphens (case-insensitive). */
export const MEMBERSHIP_NUMBER_PATTERN = /^[A-Za-z0-9-]{4,32}$/;

@InputType()
export class RegisterInput {
  @Field()
  @IsString()
  @IsNotEmpty({ message: 'Name must not be empty' })
  name: string;

  @Field()
  @IsEmail({}, { message: 'Must be a valid email address' })
  email: string;

  @Field()
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @Field({
    description:
      'Library card number. The account stays PENDING until an admin verifies it.',
  })
  @IsString()
  @Matches(MEMBERSHIP_NUMBER_PATTERN, {
    message:
      'Membership number must be 4-32 characters using letters, digits or hyphens',
  })
  membershipNumber: string;
}
