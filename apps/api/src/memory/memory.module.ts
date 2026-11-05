import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/configuration.js';
import { EMBEDDER, VoyageEmbedder } from './embedder.js';
import { MemoryIndexer } from './indexer.js';
import { MemoryController } from './memory.controller.js';
import { MemorySearch } from './search.js';

/**
 * Dossier's memory: what's written in the tools, kept past the sync window
 * and searchable by words and, with Dossier's Voyage AI key, by meaning.
 */
@Module({
  controllers: [MemoryController],
  providers: [
    MemoryIndexer,
    MemorySearch,
    {
      provide: EMBEDDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const key = config.get('VOYAGE_API_KEY', { infer: true });
        return key
          ? new VoyageEmbedder(key, {
              url: config.get('VOYAGE_API_URL', { infer: true }),
            })
          : null;
      },
    },
  ],
  exports: [MemoryIndexer, MemorySearch, EMBEDDER],
})
export class MemoryModule {}
