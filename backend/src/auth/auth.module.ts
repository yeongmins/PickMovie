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

function normalizeExpiresIn(v: string): number | StringValue {
  const raw = v.trim();
  // "900" 같은 값이면 초로 처리
  if (/^\d+$/.test(raw)) return Number(raw);
  // "15m", "1h" 등은 ms StringValue로 캐스팅
  return raw as StringValue;
}

@Module({
  imports: [
    PassportModule,
    MailModule,
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
  providers: [AuthService, JwtAccessStrategy],
  exports: [AuthService],
})
export class AuthModule {}
