// backend/src/auth/strategies/jwt-access.strategy.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import {
  ExtractJwt,
  Strategy,
  type JwtFromRequestFunction,
} from 'passport-jwt';

export type JwtAccessPayload = { sub: number; username: string };

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(
  Strategy,
  'jwt-access',
) {
  constructor(config: ConfigService) {
    // ✅ ESLint(no-unsafe-*) 방지: ExtractJwt 타입을 명확하게 좁힘
    const extractJwt = ExtractJwt as unknown as {
      fromAuthHeaderAsBearerToken: () => JwtFromRequestFunction;
    };

    super({
      jwtFromRequest: extractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey:
        config.get<string>('JWT_ACCESS_SECRET') ?? 'dev_access_secret',
    });
  }

  validate(payload: JwtAccessPayload): JwtAccessPayload {
    return payload;
  }
}
