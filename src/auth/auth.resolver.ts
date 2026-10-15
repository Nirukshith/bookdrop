import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { Public } from './decorators/public.decorator';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';
import { RegisterInput } from './dto/register.input';
import { AuthPayloadModel } from './models/auth-payload.model';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public() // unauthenticated users can register
  @Mutation(() => AuthPayloadModel, { name: 'register' })
  async register(
    @Args('input') input: RegisterInput,
  ): Promise<AuthPayloadModel> {
    return this.authService.register(input);
  }

  @Public() // unauthenticated users can login
  @Mutation(() => AuthPayloadModel, { name: 'login' })
  async login(@Args('input') input: LoginInput): Promise<AuthPayloadModel> {
    return this.authService.login(input);
  }

  @Public() // unauthenticated users can refresh tokens
  @Mutation(() => AuthPayloadModel, { name: 'refreshTokens' })
  async refreshTokens(
    @Args('refreshToken') refreshToken: string,
  ): Promise<AuthPayloadModel> {
    return this.authService.refreshTokens(refreshToken);
  }

  @Public() // this is not a secured endpoint, anyone can logout
  @Mutation(() => Boolean, { name: 'logout' })
  async logout(@Args('refreshToken') refreshToken: string): Promise<boolean> {
    return this.authService.logout(refreshToken);
  }
}
