// backend/src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import type { StringValue } from 'ms';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from './strategies/jwt-access.strategy';
import { MailModule } from '../mail/mail.module';
import { UserLibraryService } from './user-library.service';
import { TmdbModule } from '../tmdb/tmdb.module';
import { ForYouRecommendationService } from './for-you-recommendation.service';
import { TrendsModule } from '../trends/trends.module';

function normalizeExpiresIn(v: string): number | StringValue {
  const raw = v.trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  return raw as StringValue;
}

@Module({
  imports: [
    PassportModule,
    MailModule,
    TmdbModule,
    TrendsModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => {
        const expiresRaw = config.get<string>('JWT_ACCESS_EXPIRES_IN') ?? '15m';
        return {
          secret:
            config.get<string>('JWT_ACCESS_SECRET') ?? 'dev_access_secret',
          signOptions: {
            expiresIn: normalizeExpiresIn(expiresRaw),
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtAccessStrategy,
    UserLibraryService,
    ForYouRecommendationService,
  ],
  exports: [AuthService, UserLibraryService],
})
export class AuthModule {}
