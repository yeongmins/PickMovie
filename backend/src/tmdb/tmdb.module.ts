import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule } from '@nestjs/config';

import { TmdbController } from './tmdb.controller';
import { TmdbService } from './tmdb.service';

@Module({
  imports: [
    ConfigModule,
    HttpModule,
    CacheModule.register({
      ttl: 60,
      max: 500,
    }),
  ],
  controllers: [TmdbController],
  providers: [TmdbService],
  exports: [TmdbService],
})
export class TmdbModule {}
