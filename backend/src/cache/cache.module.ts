// backend/src/cache/cache.module.ts
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    NestCacheModule.register({
      isGlobal: true,
      ttl: 60, // seconds
      max: 1000,
    }),
  ],
})
export class AppCacheModule {}
