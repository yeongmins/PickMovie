import { JwtService } from '@nestjs/jwt';

type JwtPayloadLike = {
  sub?: unknown;
  username?: unknown;
  role?: unknown;
};

function pickBearerToken(authHeader: string | undefined): string | null {
  const h = String(authHeader ?? '').trim();
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function isAdminRole(role: unknown): boolean {
  const v = String(role ?? '')
    .trim()
    .toLowerCase();
  return v === 'admin' || v === 'administrator';
}

export function getViewerAccessFromAuthHeader(
  authHeader: string | string[] | undefined,
): { isAdmin: boolean } {
  const rawHeader = Array.isArray(authHeader) ? authHeader[0] : authHeader;
  const token = pickBearerToken(rawHeader);
  if (!token) return { isAdmin: false };

  try {
    const jwt = new JwtService({
      secret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret',
    });
    const payload = jwt.verify<JwtPayloadLike>(token);
    return { isAdmin: isAdminRole(payload?.role) };
  } catch {
    return { isAdmin: false };
  }
}
