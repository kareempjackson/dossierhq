import {
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  signInRequestSchema,
  signUpRequestSchema,
  type Me,
  type PasswordResetConfirm,
  type PasswordResetRequest,
  type SignInRequest,
  type SignInResponse,
  type SignUpRequest,
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

  /**
   * Creates a workspace with its owner and signs them in. 409 when the email
   * already has an account.
   */
  @Public()
  @Post('sign-up')
  signUp(
    @Body(new ZodValidationPipe(signUpRequestSchema)) request: SignUpRequest,
  ): Promise<SignInResponse> {
    return this.auth.signUp(request);
  }

  /**
   * Emails a link to choose a new password, if the address has an account.
   * 202 either way, so it doesn't reveal which emails do; 429 after three
   * for one address in an hour.
   */
  @Public()
  @Post('password-reset')
  @HttpCode(HttpStatus.ACCEPTED)
  requestPasswordReset(
    @Body(new ZodValidationPipe(passwordResetRequestSchema))
    { email }: PasswordResetRequest,
  ): Promise<void> {
    return this.auth.requestPasswordReset(email);
  }

  /**
   * Sets a new password with the link's token, ends every other session, and
   * signs in. 400 when the link has expired or was already used.
   */
  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body(new ZodValidationPipe(passwordResetConfirmSchema))
    request: PasswordResetConfirm,
  ): Promise<SignInResponse> {
    return this.auth.resetPassword(request);
  }

  /** Ends the session the request was made with. */
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(
    @SessionToken() token: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<void> {
    return this.auth.signOut(token, userId, workspaceId);
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
