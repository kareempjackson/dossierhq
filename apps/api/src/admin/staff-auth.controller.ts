import {
  inviteTokenSchema,
  signInRequestSchema,
  staffInviteAcceptSchema,
  twoFactorSignInSchema,
  type InviteToken,
  type SignInRequest,
  type StaffChallenge,
  type StaffInviteAccept,
  type StaffInviteAccepted,
  type StaffInvitePreview,
  type StaffMe,
  type StaffSession,
  type StaffTwoFactorSetup,
  type TwoFactorSignIn,
} from '@dossierhq/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { ClientIp } from '../common/client-ip.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { StaffAuthService } from './staff-auth.service.js';
import { Staff, StaffId, StaffToken } from './staff.decorator.js';

/** Staff sign-in, for the admin app. Public routes still need its key. */
@Staff()
@Controller('admin/auth')
export class StaffAuthController {
  constructor(private readonly auth: StaffAuthService) {}

  /** Checks the password and answers with a challenge for the code. */
  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  signIn(
    @Body(new ZodValidationPipe(signInRequestSchema)) request: SignInRequest,
    @ClientIp() ip: string | null,
  ): Promise<StaffChallenge> {
    return this.auth.signIn(request, ip);
  }

  /** Finishes signing in with a code from the app or a recovery code. */
  @Public()
  @Post('sign-in/two-factor')
  @HttpCode(HttpStatus.OK)
  completeTwoFactor(
    @Body(new ZodValidationPipe(twoFactorSignInSchema))
    request: TwoFactorSignIn,
    @ClientIp() ip: string | null,
  ): Promise<StaffSession> {
    return this.auth.completeTwoFactor(request, ip);
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  signOut(
    @StaffToken() token: string,
    @StaffId() staffId: string,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.auth.signOut(token, staffId, ip);
  }

  @Get('me')
  me(@StaffId() staffId: string): Promise<StaffMe> {
    return this.auth.me(staffId);
  }

  /** What an invite is for, before accepting it. */
  @Public()
  @Post('invites/preview')
  @HttpCode(HttpStatus.OK)
  previewInvite(
    @Body(new ZodValidationPipe(inviteTokenSchema)) { token }: InviteToken,
  ): Promise<StaffInvitePreview> {
    return this.auth.previewInvite(token);
  }

  /** A new authenticator secret for accepting an invite. */
  @Public()
  @Post('invites/setup')
  @HttpCode(HttpStatus.OK)
  setupInvite(
    @Body(new ZodValidationPipe(inviteTokenSchema)) { token }: InviteToken,
  ): Promise<StaffTwoFactorSetup> {
    return this.auth.setupInvite(token);
  }

  /** Makes the account, with two-factor on, and signs in. */
  @Public()
  @Post('invites/accept')
  accept(
    @Body(new ZodValidationPipe(staffInviteAcceptSchema))
    request: StaffInviteAccept,
    @ClientIp() ip: string | null,
  ): Promise<StaffInviteAccepted> {
    return this.auth.acceptInvite(request, ip);
  }
}
