// backend/src/admin-meta/admin-token.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { IncomingHttpHeaders } from 'http';
import { getViewerAccessFromAuthHeader } from '../common/viewer-access';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

type ReqLike = { headers: IncomingHttpHeaders };
type JwtPayloadLike = { sub?: unknown; role?: unknown };

function pickBearerToken(authHeader: string | string[] | undefined): string | null {
  const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const h = String(raw ?? '').trim();
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ReqLike>();

    // ConfigService가 못 읽는 경우 대비해서 process.env도 함께 확인
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
    if (getViewerAccessFromAuthHeader(req.headers['authorization']).isAdmin) {
      return true;
    }

    // 승급 직후 stale access token(role=USER)이라도, DB의 현재 role이 ADMIN이면 통과.
    const bearer = pickBearerToken(req.headers['authorization']);
    const secret = String(
      this.config.get('JWT_ACCESS_SECRET') ?? process.env.JWT_ACCESS_SECRET ?? '',
    ).trim();
    if (bearer && secret) {
      try {
        const jwt = new JwtService({ secret });
        const payload = jwt.verify<JwtPayloadLike>(bearer);
        const userId = Number(payload?.sub);
        if (Number.isFinite(userId) && userId > 0) {
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
          });
          if (String(user?.role ?? '').toUpperCase() === 'ADMIN') {
            return true;
          }
        }
      } catch {
        // ignore
      }
    }

    throw new UnauthorizedException('Missing or invalid admin access');
  }
}
