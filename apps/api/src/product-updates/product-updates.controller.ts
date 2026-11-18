import {
  productUpdatesSignupSchema,
  type ProductUpdatesSignup,
} from '@dossierhq/contracts';
import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { ClientIp } from '../common/client-ip.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { ProductUpdatesService } from './product-updates.service.js';

/** The public site's product-updates sign-up. */
@Controller('product-updates')
export class ProductUpdatesController {
  constructor(private readonly updates: ProductUpdatesService) {}

  /**
   * Signs someone up for news about Dossier. 204 whether or not they were on
   * the list already; 400 for an address that isn't one; 429 after ten from
   * one network, or five for one email, in an hour.
   */
  @Public()
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  subscribe(
    @Body(new ZodValidationPipe(productUpdatesSignupSchema))
    { email, source }: ProductUpdatesSignup,
    @ClientIp() ip: string | null,
  ): Promise<void> {
    return this.updates.subscribe(email, source ?? null, ip);
  }
}
