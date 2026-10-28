import {
  inviteAcceptSchema,
  inviteTokenSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  signInRequestSchema,
  signUpRequestSchema,
  type InviteAccept,
  type InvitePreview,
  type InviteToken,
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
import { ClientIp } from '../common/client-ip.js';
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
    @ClientIp() ip: string | null,
  ): Promise<SignInResponse> {
    return this.auth.signIn(request, ip);
  }

  /**
   * Creates a workspace with its owner and signs them in. 409 when the email
   * already has an account.
   */
  @Public()
  @Post('sign-up')
  signUp(
    @Body(new ZodValidationPipe(signUpRequestSchema)) request: SignUpRequest,
    @ClientIp() ip: string | null,
  ): Promise<SignInResponse> {
    return this.auth.signUp(request, ip);
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
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.auth.requestPasswordReset(email, ip);
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
    @ClientIp() ip: string | null,
  ): Promise<SignInResponse> {
    return this.auth.resetPassword(request, ip);
  }

  /** What an invite is for, before accepting it. 400 when it can't be used. */
  @Public()
  @Post('invites/preview')
  @HttpCode(HttpStatus.OK)
  previewInvite(
    @Body(new ZodValidationPipe(inviteTokenSchema)) { token }: InviteToken,
  ): Promise<InvitePreview> {
    return this.auth.previewInvite(token);
  }

  /**
   * Accepts an invite: creates the account, joins the workspace and signs
   * in. 400 when the invite can't be used; 409 when the email has an account.
   */
  @Public()
  @Post('invites/accept')
  @HttpCode(HttpStatus.OK)
  acceptInvite(
    @Body(new ZodValidationPipe(inviteAcceptSchema)) request: InviteAccept,
    @ClientIp() ip: string | null,
  ): Promise<SignInResponse> {
    return this.auth.acceptInvite(request, ip);
  }

  /** Ends the session the request was made with. */
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(
    @SessionToken() token: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.auth.signOut(token, userId, workspaceId, ip);
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
