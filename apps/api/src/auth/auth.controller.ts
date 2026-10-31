import {
  inviteAcceptSchema,
  inviteTokenSchema,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  signInRequestSchema,
  signUpRequestSchema,
  supportRedeemSchema,
  twoFactorSignInSchema,
  type InviteAccept,
  type InvitePreview,
  type InviteToken,
  type Me,
  type PasswordResetConfirm,
  type PasswordResetRequest,
  type Sessions,
  type SignInRequest,
  type SignInResponse,
  type SignInStep,
  type TwoFactorSignIn,
  type SignUpRequest,
  type SupportRedeem,
  type SupportSession,
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
import {
  SessionToken,
  SupportViewOf,
  UserId,
  WorkspaceId,
  type SupportView,
} from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { AuthService } from './auth.service.js';
import { Public } from './public.decorator.js';
import { SupportAccess } from './support-access.service.js';
import { NoSupport, SupportAllowed } from './support.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly support: SupportAccess,
  ) {}

  /**
   * Checks the password and starts a session, or, with two-factor on, answers
   * with a challenge to send back with a code. 401 when they don't match.
   */
  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  signIn(
    @Body(new ZodValidationPipe(signInRequestSchema)) request: SignInRequest,
    @ClientIp() ip: string | null,
  ): Promise<SignInStep> {
    return this.auth.signIn(request, ip);
  }

  /**
   * Finishes a two-factor sign-in with a code from the app or a recovery
   * code. 400 when the challenge is stale; 401 for a wrong code.
   */
  @Public()
  @Post('sign-in/two-factor')
  @HttpCode(HttpStatus.OK)
  completeTwoFactor(
    @Body(new ZodValidationPipe(twoFactorSignInSchema))
    request: TwoFactorSignIn,
    @ClientIp() ip: string | null,
  ): Promise<SignInResponse> {
    return this.auth.completeTwoFactor(request, ip);
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
   * signs in (or, with two-factor on, asks for a code). 400 when the link has
   * expired or was already used.
   */
  @Public()
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.OK)
  resetPassword(
    @Body(new ZodValidationPipe(passwordResetConfirmSchema))
    request: PasswordResetConfirm,
    @ClientIp() ip: string | null,
  ): Promise<SignInStep> {
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

  /**
   * Opens a support link from Dossier Admin: swaps its one-time token for a
   * read-only session that acts as the workspace's owner. 400 when the link
   * has expired or was used.
   */
  @Public()
  @Post('support/redeem')
  @HttpCode(HttpStatus.OK)
  redeemSupport(
    @Body(new ZodValidationPipe(supportRedeemSchema)) { token }: SupportRedeem,
  ): Promise<SupportSession> {
    return this.support.redeem(token);
  }

  /** This session, and how many others the user has live. */
  @NoSupport()
  @Get('sessions')
  sessions(
    @SessionToken() token: string,
    @UserId() userId: string,
  ): Promise<Sessions> {
    return this.auth.sessions(token, userId);
  }

  /** Signs the user out everywhere but here. */
  @Post('sessions/sign-out-others')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOutOthers(
    @SessionToken() token: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.auth.signOutOthers(token, userId, workspaceId, ip);
  }

  /** Ends the session the request was made with, or the support view. */
  @SupportAllowed()
  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(
    @SessionToken() token: string,
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
    @SupportViewOf() support: SupportView | null,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return support
      ? this.support.endFromView(token)
      : this.auth.signOut(token, userId, workspaceId, ip);
  }

  /**
   * Who is signed in, and the workspace the session acts on. In a support
   * view, the owner it acts as, and who from Dossier is looking.
   */
  @Get('me')
  async me(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
    @SupportViewOf() support: SupportView | null,
  ): Promise<Me> {
    const me = await this.auth.me(userId, workspaceId);
    return support
      ? {
          ...me,
          support: { staffName: support.staffName, endsAt: support.endsAt },
        }
      : me;
  }
}
