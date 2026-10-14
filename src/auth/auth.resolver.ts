import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';
import { RegisterInput } from './dto/register.input';
import { AuthPayloadModel } from './models/auth-payload.model';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => AuthPayloadModel, { name: 'register' })
  async register(
    @Args('input') input: RegisterInput,
  ): Promise<AuthPayloadModel> {
    return this.authService.register(input);
  }

  @Mutation(() => AuthPayloadModel, { name: 'login' })
  async login(@Args('input') input: LoginInput): Promise<AuthPayloadModel> {
    return this.authService.login(input);
  }

  @Mutation(() => AuthPayloadModel, { name: 'refreshTokens' })
  async refreshTokens(
    @Args('refreshToken') refreshToken: string,
  ): Promise<AuthPayloadModel> {
    return this.authService.refreshTokens(refreshToken);
  }

  @Mutation(() => Boolean, { name: 'logout' })
  async logout(@Args('refreshToken') refreshToken: string): Promise<boolean> {
    return this.authService.logout(refreshToken);
  }
}
