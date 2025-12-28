// backend/src/auth/auth.service.ts
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';

type SafeUser = {
  id: number;
  username: string;
  email: string | null;
  nickname: string | null;
};

type LoginResult = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

// ✅ 하루 제한(아이디 찾기/비번 찾기)
type DailyCounter = { count: number; resetAt: number };
const DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  // ✅ IP 기준 요청 제한용(메모리)
  private readonly recoveryLimitMap = new Map<string, DailyCounter>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailService,
  ) {}

  private errToString(err: unknown): string {
    if (err instanceof Error) return err.stack ?? err.message;
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }

  private mailRequired(): boolean {
    const v = (
      this.config.get<string>('MAIL_REQUIRED') ?? 'false'
    ).toLowerCase();
    return v === 'true';
  }

  private backendUrl(): string {
    return this.config.get<string>('BACKEND_URL') ?? 'http://localhost:3000';
  }

  private frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private newOpaqueToken(bytes = 64): string {
    return randomBytes(bytes).toString('base64url');
  }

  private accessTokenFor(userId: number, username: string): string {
    return this.jwt.sign({ sub: userId, username });
  }

  private refreshDays(): number {
    const n = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? '14');
    return Number.isFinite(n) && n > 0 ? n : 14;
  }

  private resetMinutes(): number {
    const n = Number(
      this.config.get<string>('PASSWORD_RESET_TTL_MINUTES') ?? '15',
    );
    return Number.isFinite(n) && n > 0 ? n : 15;
  }

  private emailVerifyHours(): number {
    const n = Number(this.config.get<string>('EMAIL_VERIFY_TTL_HOURS') ?? '24');
    return Number.isFinite(n) && n > 0 ? n : 24;
  }

  private safeUser(u: {
    id: number;
    username: string;
    email: string | null;
    nickname: string | null;
  }): SafeUser {
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      nickname: u.nickname,
    };
  }

  /**
   * ✅ 아이디(username) 마스킹
   * - 1~2: 전부 *
   * - 3~4: 첫 글자만 노출 + 나머지 *
   * - 5+: 앞2 + 중간* + 뒤2
   *   예) asdzxc123 -> as*****23
   */
  private maskUsername(username: string): string {
    const s = (username ?? '').trim();
    const n = s.length;

    if (n <= 0) return '';
    if (n <= 2) return '*'.repeat(n);
    if (n <= 4) return s[0] + '*'.repeat(n - 1);

    const head = s.slice(0, 2);
    const tail = s.slice(-2);
    return head + '*'.repeat(n - 4) + tail;
  }

  // ✅ 하루 10회 제한(아이디 찾기/비번 찾기)
  private enforceRecoveryDailyLimit(
    kind: 'username_lookup' | 'password_reset',
    ip?: string,
  ) {
    const safeIp = (ip || 'unknown').replace('::ffff:', '').trim() || 'unknown';
    const key = `${kind}:${safeIp}`;
    const now = Date.now();
    const cur = this.recoveryLimitMap.get(key);

    if (!cur || cur.resetAt <= now) {
      this.recoveryLimitMap.set(key, { count: 1, resetAt: now + DAY_MS });
      return;
    }

    if (cur.count >= DAILY_LIMIT) {
      // ✅ Nest 버전에 따라 TooManyRequestsException이 없을 수 있으므로 429를 직접 던짐
      throw new HttpException(
        '하루 요청 가능 횟수를 초과했습니다. (10회/일)',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    cur.count += 1;
    this.recoveryLimitMap.set(key, cur);
  }

  async isUsernameAvailable(username: string): Promise<boolean> {
    const u = (username ?? '').trim();
    if (!u) return false;

    const exists = await this.prisma.user.findUnique({
      where: { username: u },
      select: { id: true },
    });

    return !exists;
  }

  async isNicknameAvailable(value: string): Promise<boolean> {
    const v = (value ?? '').trim();
    if (!v) return false;

    const exists = await this.prisma.user.findFirst({
      where: { OR: [{ username: v }, { nickname: v }] },
      select: { id: true },
    });

    return !exists;
  }

  private async issueEmailVerificationToken(userId: number): Promise<string> {
    const rawToken = this.newOpaqueToken(48);
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(
      Date.now() + this.emailVerifyHours() * 60 * 60 * 1000,
    );

    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId, usedAt: null },
    });

    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
      select: { id: true },
    });

    return rawToken;
  }

  async signup(input: {
    username: string;
    password: string;
    email?: string;
    nickname?: string;
  }): Promise<SafeUser> {
    const username = input.username.trim();
    const email = input.email?.trim() || undefined;
    const nickname = input.nickname?.trim() || undefined;

    const exists = await this.prisma.user.findUnique({ where: { username } });
    if (exists) throw new ConflictException('이미 사용 중인 아이디입니다.');

    if (email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email },
      });
      if (emailExists)
        throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    if (nickname) {
      const nickExists = await this.prisma.user.findFirst({
        where: { nickname },
        select: { id: true },
      });
      if (nickExists)
        throw new ConflictException('이미 사용 중인 닉네임입니다.');
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
    });

    const user = await this.prisma.user.create({
      data: {
        username,
        email: email ?? null,
        nickname: nickname ?? null,
        passwordHash,
        emailVerifiedAt: null,
      },
      select: { id: true, username: true, email: true, nickname: true },
    });

    if (user.email) {
      const raw = await this.issueEmailVerificationToken(user.id);
      const verifyUrl = `${this.backendUrl()}/auth/email/verify?token=${encodeURIComponent(raw)}`;

      try {
        await this.mailer.sendEmailVerification(user.email, verifyUrl);
      } catch (err: unknown) {
        this.logger.error(
          'sendEmailVerification failed',
          this.errToString(err),
        );

        if ((process.env.NODE_ENV ?? 'development') !== 'production') {
          this.logger.warn(
            `[DEV] Email verification link for ${user.email}: ${verifyUrl}`,
          );
        }

        if (this.mailRequired()) {
          throw new ServiceUnavailableException(
            '이메일 발송 설정이 올바르지 않습니다. 서버 MAIL 설정을 확인해주세요.',
          );
        }
      }
    }

    return this.safeUser(user);
  }

  async login(
    input: { username: string; password: string },
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    const username = input.username.trim();

    const user = await this.prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        passwordHash: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) {
      throw new UnauthorizedException(
        '아이디 또는 비밀번호가 올바르지 않습니다.',
      );
    }

    if (user.email && !user.emailVerifiedAt) {
      throw new ForbiddenException('이메일 인증이 필요합니다.');
    }

    const accessToken = this.accessTokenFor(user.id, user.username);
    const { refreshToken, expiresAt } = await this.issueRefreshToken(
      user.id,
      meta,
    );

    return {
      user: this.safeUser(user),
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt,
    };
  }

  private async issueRefreshToken(
    userId: number,
    meta: { ip?: string; userAgent?: string },
    replacedByTokenId?: number,
  ): Promise<{ refreshToken: string; expiresAt: Date }> {
    const refreshToken = this.newOpaqueToken(64);
    const tokenHash = this.sha256(refreshToken);

    const expiresAt = new Date(
      Date.now() + this.refreshDays() * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent ?? null,
        replacedByTokenId: replacedByTokenId ?? null,
      },
      select: { id: true, expiresAt: true },
    });

    return { refreshToken, expiresAt };
  }

  async refresh(
    refreshToken: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<RefreshResult> {
    const tokenHash = this.sha256(refreshToken);

    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, username: true } } },
    });

    if (!current) throw new UnauthorizedException('유효하지 않은 토큰입니다.');
    if (current.revokedAt)
      throw new UnauthorizedException('폐기된 토큰입니다.');
    if (current.expiresAt.getTime() <= Date.now())
      throw new UnauthorizedException('만료된 토큰입니다.');

    const next = await this.prisma.$transaction(async (tx) => {
      const fresh = await tx.refreshToken.findUnique({ where: { tokenHash } });
      if (!fresh || fresh.revokedAt)
        throw new UnauthorizedException('유효하지 않은 토큰입니다.');

      const newToken = this.newOpaqueToken(64);
      const newHash = this.sha256(newToken);
      const newExpiresAt = new Date(
        Date.now() + this.refreshDays() * 24 * 60 * 60 * 1000,
      );

      const created = await tx.refreshToken.create({
        data: {
          userId: current.userId,
          tokenHash: newHash,
          expiresAt: newExpiresAt,
          ip: meta.ip ?? null,
          userAgent: meta.userAgent ?? null,
        },
        select: { id: true, expiresAt: true },
      });

      await tx.refreshToken.update({
        where: { id: current.id },
        data: { revokedAt: new Date(), replacedByTokenId: created.id },
      });

      return {
        raw: newToken,
        expiresAt: created.expiresAt,
        userId: current.userId,
        username: current.user.username,
      };
    });

    const accessToken = this.accessTokenFor(next.userId, next.username);
    return {
      accessToken,
      refreshToken: next.raw,
      refreshExpiresAt: next.expiresAt,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllUserRefreshTokens(userId: number): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async requestEmailVerification(email: string): Promise<void> {
    const e = (email ?? '').trim();
    if (!e) return;

    const user = await this.prisma.user.findUnique({
      where: { email: e },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    if (!user || !user.email) return;
    if (user.emailVerifiedAt) return;

    const raw = await this.issueEmailVerificationToken(user.id);
    const verifyUrl = `${this.backendUrl()}/auth/email/verify?token=${encodeURIComponent(raw)}`;

    try {
      await this.mailer.sendEmailVerification(user.email, verifyUrl);
    } catch (err: unknown) {
      this.logger.error(
        'requestEmailVerification send failed',
        this.errToString(err),
      );

      if ((process.env.NODE_ENV ?? 'development') !== 'production') {
        this.logger.warn(
          `[DEV] Email verification link for ${user.email}: ${verifyUrl}`,
        );
      }

      if (this.mailRequired()) {
        throw new ServiceUnavailableException(
          '이메일 발송 설정이 올바르지 않습니다. 서버 MAIL 설정을 확인해주세요.',
        );
      }
    }
  }

  async verifyEmail(token: string): Promise<void> {
    const raw = (token ?? '').trim();
    if (!raw) throw new ForbiddenException('유효하지 않은 토큰입니다.');

    const tokenHash = this.sha256(raw);

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, emailVerifiedAt: true } } },
    });

    if (!record) throw new ForbiddenException('유효하지 않은 토큰입니다.');
    if (record.usedAt) throw new ForbiddenException('이미 사용된 토큰입니다.');
    if (record.expiresAt.getTime() <= Date.now())
      throw new ForbiddenException('만료된 토큰입니다.');

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      if (!record.user.emailVerifiedAt) {
        await tx.user.update({
          where: { id: record.user.id },
          data: { emailVerifiedAt: new Date() },
        });
      }
    });
  }

  // ✅ ip 추가(옵션) + 하루 10회 제한 적용
  async requestPasswordReset(identifier: string, ip?: string): Promise<void> {
    this.enforceRecoveryDailyLimit('password_reset', ip);

    const id = identifier.trim();

    const user = id.includes('@')
      ? await this.prisma.user.findUnique({
          where: { email: id },
          select: { id: true, email: true },
        })
      : await this.prisma.user.findUnique({
          where: { username: id },
          select: { id: true, email: true },
        });

    if (!user || !user.email) return;

    const rawToken = this.newOpaqueToken(48);
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(Date.now() + this.resetMinutes() * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${this.frontendUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;

    try {
      await this.mailer.sendPasswordReset(user.email, resetUrl);
    } catch (err: unknown) {
      this.logger.error('sendPasswordReset failed', this.errToString(err));

      if ((process.env.NODE_ENV ?? 'development') !== 'production') {
        this.logger.warn(
          `[DEV] Password reset link for ${user.email}: ${resetUrl}`,
        );
      }

      if (this.mailRequired()) {
        throw new ServiceUnavailableException(
          '이메일 발송 설정이 올바르지 않습니다. 서버 MAIL 설정을 확인해주세요.',
        );
      }
    }
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const tokenHash = this.sha256(token.trim());

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, username: true } } },
    });

    if (!record) throw new ForbiddenException('유효하지 않은 토큰입니다.');
    if (record.usedAt) throw new ForbiddenException('이미 사용된 토큰입니다.');
    if (record.expiresAt.getTime() <= Date.now())
      throw new ForbiddenException('만료된 토큰입니다.');

    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  /**
   * ✅ 아이디 찾기(이메일로)
   * - 마스킹해서 안내
   * - 메일 실패로 500 터지지 않게 처리
   * - ✅ ip(옵션) + 하루 10회 제한 적용
   */
  async requestUsernameByEmail(email: string, ip?: string): Promise<void> {
    this.enforceRecoveryDailyLimit('username_lookup', ip);

    const e = (email ?? '').trim();
    if (!e) return;

    const user = await this.prisma.user.findUnique({
      where: { email: e },
      select: { username: true, email: true },
    });

    if (!user || !user.email) return;

    const masked = this.maskUsername(user.username);
    const loginUrl = `${this.frontendUrl()}/login`;

    try {
      await this.mailer.sendUsernameHint(user.email, masked, loginUrl);
    } catch (err: unknown) {
      this.logger.error('sendUsernameHint failed', this.errToString(err));

      if ((process.env.NODE_ENV ?? 'development') !== 'production') {
        this.logger.warn(
          `[DEV] Username hint for ${user.email}: ${masked} (login: ${loginUrl})`,
        );
      }

      if (this.mailRequired()) {
        throw new ServiceUnavailableException(
          '이메일 발송 설정이 올바르지 않습니다. 서버 MAIL 설정을 확인해주세요.',
        );
      }
    }
  }

  async me(userId: number): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, nickname: true },
    });
    if (!user) throw new UnauthorizedException();
    return this.safeUser(user);
  }
}
