import {
  companyUpdateSchema,
  profileUpdateSchema,
  type Me,
  type Onboarding,
} from '@dossierhq/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
} from '@nestjs/common';
import { ClientIp } from '../common/client-ip.js';
import { UserId, WorkspaceId } from '../common/workspace.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DuringOnboarding } from './onboarding.decorator.js';
import {
  OnboardingService,
  type CompanyUpdateParsed,
  type ProfileUpdateParsed,
} from './onboarding.service.js';
import { RequireRole } from './role.decorator.js';

/** Setting up an account after confirming the email, or joining by invite. */
@Controller('onboarding')
@DuringOnboarding()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** What's been saved so far, to pick up from. */
  @Get()
  get(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
  ): Promise<Onboarding> {
    return this.onboarding.get(userId, workspaceId);
  }

  /** Your name and what you do. */
  @Put('profile')
  saveProfile(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(profileUpdateSchema))
    profile: ProfileUpdateParsed,
  ): Promise<Onboarding> {
    return this.onboarding.saveProfile(userId, workspaceId, profile);
  }

  /** Any of the company's details; the rest stay as they are. */
  @Put('company')
  @RequireRole('admin', 'change the company’s details')
  saveCompany(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
    @Body(new ZodValidationPipe(companyUpdateSchema))
    changes: CompanyUpdateParsed,
  ): Promise<Onboarding> {
    return this.onboarding.saveCompany(userId, workspaceId, changes);
  }

  /** Finishes onboarding. 409 until two-factor sign-in is on. */
  @Post('finish')
  @HttpCode(HttpStatus.OK)
  finish(
    @UserId() userId: string,
    @WorkspaceId() workspaceId: string,
    @ClientIp() ip: string | null,
  ): Promise<Me> {
    return this.onboarding.finish(userId, workspaceId, ip);
  }
}
