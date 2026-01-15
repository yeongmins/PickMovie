// backend/src/admin-meta/guards/admin.guard.ts
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function pickString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = obj[key];
  return typeof v === 'string' ? v : undefined;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<unknown>();
    if (!isRecord(req)) return false;

    const user = req['user'];
    if (!isRecord(user)) return false;

    const role = (pickString(user, 'role') ?? '').toLowerCase();
    if (role === 'admin' || role === 'administrator') return true;

    const email = (pickString(user, 'email') ?? '').toLowerCase();
    const username = (pickString(user, 'username') ?? '').toLowerCase();
    const sub = (pickString(user, 'sub') ?? '').toLowerCase();
    const id = (pickString(user, 'id') ?? '').toLowerCase();

    const raw = this.config.get<string>('ADMIN_EMAILS') ?? '';
    const allow = raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (allow.length === 0) return false;
    return (
      allow.includes(email) ||
      allow.includes(username) ||
      allow.includes(sub) ||
      allow.includes(id)
    );
  }
}
