// backend/src/auth/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtAccessPayload } from '../strategies/jwt-access.strategy';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): JwtAccessPayload | null => {
    const req = ctx.switchToHttp().getRequest<{ user?: JwtAccessPayload }>();
    return req.user ?? null;
  },
);
