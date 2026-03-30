// backend/src/common/guards/admin-token.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

function pickBearerToken(authHeader: string | undefined): string | null {
  const h = String(authHeader ?? '').trim();
  if (!h) return null;

  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

@Injectable()
export class AdminTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
    }>();

    const adminToken = String(process.env.ADMIN_TOKEN ?? '').trim();
    if (!adminToken) {
      // 운영 안전상: ADMIN_TOKEN 없으면 무조건 막음
      throw new UnauthorizedException('ADMIN_TOKEN is not set');
    }

    const headers = req.headers ?? {};
    const authHeader = Array.isArray(headers['authorization'])
      ? headers['authorization'][0]
      : headers['authorization'];

    const token = pickBearerToken(authHeader);
    if (!token || token !== adminToken) {
      throw new UnauthorizedException('Invalid admin token');
    }

    return true;
  }
}
