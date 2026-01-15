// backend/src/admin-meta/admin-token.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingHttpHeaders } from 'http';

type ReqLike = { headers: IncomingHttpHeaders };

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<ReqLike>();

    // ✅ ConfigService가 못 읽는 경우 대비해서 process.env도 함께 확인
    const expected = String(
      this.config.get('ADMIN_TOKEN') ?? process.env.ADMIN_TOKEN ?? '',
    ).trim();

    if (!expected) {
      throw new UnauthorizedException('ADMIN_TOKEN is not set');
    }

    const raw = req.headers['x-admin-token'];
    const got = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
    const token = typeof got === 'string' ? got.trim() : '';

    if (token && token === expected) return true;

    throw new UnauthorizedException('Missing or invalid admin token');
  }
}
