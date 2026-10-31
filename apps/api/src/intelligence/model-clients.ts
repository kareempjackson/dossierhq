import Anthropic from '@anthropic-ai/sdk';
import { providerInfo, type ProviderId } from '@dossierhq/contracts';
import { ApiError, GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { GeminiModel } from './gemini-model.js';
import {
  ClaudeModel,
  IntelligenceFailure,
  type IntelligenceModel,
} from './model.js';
import { RESPONSES_BASE_URLS, ResponsesModel } from './responses-model.js';

/** Makes models on the keys workspaces bring. Tests swap it. */
export interface ModelClients {
  /** A model that sends its requests to `provider` on a workspace's key. */
  connect(provider: ProviderId, apiKey: string): IntelligenceModel;
  /**
   * Resolves when the provider takes the key, without spending anything.
   * Throws IntelligenceFailure, in words to show, when it doesn't.
   */
  check(provider: ProviderId, apiKey: string): Promise<void>;
}

/** Injection token for ModelClients. */
export const MODEL_CLIENTS = Symbol('MODEL_CLIENTS');

/** The real providers' APIs. */
export class ProviderClients implements ModelClients {
  connect(provider: ProviderId, apiKey: string): IntelligenceModel {
    switch (provider) {
      case 'anthropic':
        return new ClaudeModel(apiKey, 'workspace');
      case 'openai':
      case 'xai':
        return new ResponsesModel(provider, apiKey, 'workspace');
      case 'google':
        return new GeminiModel(apiKey, 'workspace');
    }
  }

  async check(provider: ProviderId, apiKey: string): Promise<void> {
    try {
      // Listing models is free at all four, and needs a working key.
      switch (provider) {
        case 'anthropic':
          await new Anthropic({ apiKey }).models.list({ limit: 1 });
          return;
        case 'openai':
        case 'xai':
          await new OpenAI({
            apiKey,
            baseURL: RESPONSES_BASE_URLS[provider],
          }).models.list();
          return;
        case 'google':
          await new GoogleGenAI({ apiKey }).models.list({
            config: { pageSize: 1 },
          });
          return;
      }
    } catch (error) {
      throw new IntelligenceFailure('failed', checkFailed(provider, error));
    }
  }
}

function checkFailed(provider: ProviderId, error: unknown): string {
  const { name } = providerInfo(provider);
  const status =
    error instanceof Anthropic.APIError || error instanceof OpenAI.APIError
      ? error.status
      : error instanceof ApiError
        ? error.status
        : undefined;
  const message = (error as Error)?.message ?? '';
  if (
    status === 401 ||
    status === 403 ||
    (status === 400 && /API[ _]?key/i.test(message))
  ) {
    return `${name} didn’t accept that key. Check you copied all of it, and that it hasn’t been revoked.`;
  }
  if (status === 429) {
    return `${name} is limiting requests from that key just now. Try again in a minute.`;
  }
  if (status === undefined) {
    return `Dossier couldn’t reach ${name} to check the key. Try again in a minute.`;
  }
  return `${name} couldn’t check the key (${status}): ${message}`;
}
