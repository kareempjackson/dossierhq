import {
  signInRequestSchema,
  type Me,
  type SignInRequest,
  type SignInResponse,
} from '@dossierhq/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { SessionToken, UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Checks the password and starts a session. 401 when they don't match. */
  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  signIn(
    @Body(new ZodValidationPipe(signInRequestSchema)) request: SignInRequest,
  ): Promise<SignInResponse> {
    return this.auth.signIn(request);
  }

  /** Ends the session the request was made with. */
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(@SessionToken() token: string): Promise<void> {
    return this.auth.signOut(token);
  }

  /** Who is signed in, and the workspace the session acts on. */
  @Get('me')
  me(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<Me> {
    return this.auth.me(userId, workspaceId);
  }
}
