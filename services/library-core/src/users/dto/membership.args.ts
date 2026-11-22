import { ArgsType, Field, Int } from '@nestjs/graphql';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { MembershipStatus } from '@prisma/client';

@ArgsType()
export class ReviewMembershipArgs {
  @Field(() => Int)
  @IsInt()
  @IsPositive()
  userId: number;
}

@ArgsType()
export class RejectMembershipArgs extends ReviewMembershipArgs {
  @Field(() => String, {
    nullable: true,
    description:
      'Why the application was rejected; included in the email to the member',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

@ArgsType()
export class MembershipApplicationsArgs {
  @Field(() => MembershipStatus, {
    defaultValue: MembershipStatus.PENDING,
    description: 'Which applications to list (defaults to PENDING)',
  })
  @IsOptional()
  @IsEnum(MembershipStatus)
  status: MembershipStatus = MembershipStatus.PENDING;
}
