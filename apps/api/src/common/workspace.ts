import {
  createParamDecorator,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { AppConfig } from '../config/configuration.js';

type WorkspaceRequest = Request & { workspaceId?: string };

/**
 * Decides which workspace a request acts on. Today that is WORKSPACE_ID from
 * the config; once sign-in exists this guard reads it from the session (and
 * rejects anonymous requests), and nothing downstream changes.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  private readonly workspaceId: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.workspaceId = config.get('WORKSPACE_ID', { infer: true });
  }

  canActivate(context: ExecutionContext): boolean {
    context.switchToHttp().getRequest<WorkspaceRequest>().workspaceId =
      this.workspaceId;
    return true;
  }
}

/** The current request's workspace ID, set by WorkspaceGuard. */
export const WorkspaceId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const { workspaceId } = context
      .switchToHttp()
      .getRequest<WorkspaceRequest>();
    if (!workspaceId) throw new Error('WorkspaceGuard did not run');
    return workspaceId;
  },
);
