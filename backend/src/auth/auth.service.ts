// backend/src/auth/auth.service.ts
import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  ConflictException,
  HttpException,
  HttpStatus,
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
  profileImageUrl: string | null;
  role: string;
};

type LoginResult = {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  isNewUser?: boolean;
};

type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
};

// 하루 제한(아이디 찾기/비번 찾기)
type DailyCounter = { count: number; resetAt: number };
const DAILY_LIMIT = 10;
const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL_AUTH_RESEND_LIMIT_PER_DAY = 5;
const EMAIL_AUTH_RESEND_INTERVAL_MS = 5 * 60 * 1000;
type EmailAuthResendCounter = {
  dayKey: string;
  count: number;
  lastAt: number;
};
type EmailChangeTicket = {
  userId: number;
  newEmail: string;
  expiresAt: number;
  usedAt?: number;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly recoveryLimitMap = new Map<string, DailyCounter>();
  private readonly emailAuthResendMap = new Map<
    string,
    EmailAuthResendCounter
  >();
  private readonly emailChangeTokenMap = new Map<string, EmailChangeTicket>();

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
    const fallback =
      (this.config.get<string>('NODE_ENV') ?? 'development') === 'production'
        ? 'true'
        : 'false';
    const v = (this.config.get<string>('MAIL_REQUIRED') ?? fallback).toLowerCase();
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

  private accessTokenFor(
    userId: number,
    username: string,
    role?: string,
  ): string {
    return this.jwt.sign({ sub: userId, username, role: role ?? 'USER' });
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

  private emailAuthMinutes(): number {
    const n = Number(this.config.get<string>('EMAIL_AUTH_TTL_MINUTES') ?? '20');
    return Number.isFinite(n) && n > 0 ? n : 20;
  }

  private emailChangeMinutes(): number {
    const n = Number(
      this.config.get<string>('EMAIL_CHANGE_TTL_MINUTES') ?? '30',
    );
    return Number.isFinite(n) && n > 0 ? n : 30;
  }

  private normalizeEmail(value: string): string {
    return (value ?? '').trim().toLowerCase();
  }

  private validateNicknameFormat(nickname: string): void {
    const v = (nickname ?? '').trim();
    if (!v) return;

    if (v.length < 2) {
      throw new ConflictException('닉네임은 최소 2자 이상이어야 합니다.');
    }
    if (!/^[A-Za-z0-9가-힣]+$/.test(v)) {
      throw new ConflictException(
        '닉네임은 한글, 영문, 숫자만 사용할 수 있습니다.',
      );
    }
    const hasHangul = /[가-힣]/.test(v);
    const maxLen = hasHangul ? 10 : 15;
    if (v.length > maxLen) {
      throw new ConflictException(
        '한글 닉네임은 최대 10자, 영문/숫자 닉네임은 최대 15자까지 가능합니다.',
      );
    }
  }

  private seoulDayKey(ts = Date.now()): string {
    const d = new Date(ts);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Seoul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const y = parts.find((p) => p.type === 'year')?.value ?? '0000';
    const m = parts.find((p) => p.type === 'month')?.value ?? '00';
    const day = parts.find((p) => p.type === 'day')?.value ?? '00';
    return `${y}-${m}-${day}`;
  }

  private enforceEmailAuthResendLimit(email: string): void {
    const now = Date.now();
    const dayKey = this.seoulDayKey(now);
    const key = email.toLowerCase();
    const cur = this.emailAuthResendMap.get(key);
    const state: EmailAuthResendCounter =
      !cur || cur.dayKey !== dayKey
        ? { dayKey, count: 0, lastAt: 0 }
        : { ...cur };

    if (state.count >= EMAIL_AUTH_RESEND_LIMIT_PER_DAY) {
      throw new ConflictException(
        '재전송은 하루 5회까지 가능합니다. 내일 다시 시도해주세요.',
      );
    }

    if (state.count >= 1) {
      const diff = now - state.lastAt;
      if (diff < EMAIL_AUTH_RESEND_INTERVAL_MS) {
        const remainMs = EMAIL_AUTH_RESEND_INTERVAL_MS - diff;
        const remainMin = Math.ceil(remainMs / 60000);
        throw new ConflictException(
          `재전송은 5분 간격으로 가능합니다. 약 ${remainMin}분 후 다시 시도해주세요.`,
        );
      }
    }

    state.count += 1;
    state.lastAt = now;
    this.emailAuthResendMap.set(key, state);
  }

  private safeUser(u: {
    id: number;
    username: string;
    email: string | null;
    nickname: string | null;
    profileImageUrl: string | null;
    role?: string | null;
  }): SafeUser {
    return {
      id: u.id,
      username: u.username,
      email: u.email,
      nickname: u.nickname,
      profileImageUrl: u.profileImageUrl,
      role: String(u.role ?? 'USER'),
    };
  }

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
    if (v.length < 2) return false;
    if (!/^[A-Za-z0-9가-힣]+$/.test(v)) return false;
    const hasHangul = /[가-힣]/.test(v);
    if (v.length > (hasHangul ? 10 : 15)) return false;

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

  private async issueEmailAuthToken(
    email: string,
    userId?: number,
  ): Promise<string> {
    const rawToken = this.newOpaqueToken(48);
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(Date.now() + this.emailAuthMinutes() * 60_000);

    await this.prisma.emailAuthToken.deleteMany({
      where: { email, usedAt: null },
    });

    await this.prisma.emailAuthToken.create({
      data: {
        email,
        userId: userId ?? null,
        tokenHash,
        expiresAt,
      },
      select: { id: true },
    });

    return rawToken;
  }

  private async makeUniqueUsernameByEmail(
    tx: { user: PrismaService['user'] },
    email: string,
  ): Promise<string> {
    const localRaw = email.split('@')[0] ?? 'user';
    const base = localRaw
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 12);

    const prefix = (base.length >= 3 ? base : 'user').slice(0, 12);

    for (let i = 0; i < 20; i += 1) {
      const suffix = randomBytes(3).toString('hex');
      const cand = `${prefix}_${suffix}`.slice(0, 20);
      const exists = await tx.user.findUnique({
        where: { username: cand },
        select: { id: true },
      });
      if (!exists) return cand;
    }

    throw new ConflictException(
      '계정 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
    );
  }

  private async makeUniqueUnknownNickname(
    tx: { user: PrismaService['user'] },
    excludeUserId?: number,
  ): Promise<string> {
    const base = 'Unknown';

    for (let i = 0; i < 5000; i += 1) {
      const cand = i === 0 ? base : `${base}${i + 1}`;
      const exists = await tx.user.findFirst({
        where: {
          ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
          OR: [{ username: cand }, { nickname: cand }],
        },
        select: { id: true },
      });
      if (!exists) return cand;
    }

    throw new ConflictException(
      '닉네임 자동 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
    );
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
      this.validateNicknameFormat(nickname);
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
        profileImageUrl: null,
        passwordHash,
        emailVerifiedAt: null,
      },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        profileImageUrl: true,
        role: true,
      },
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
        profileImageUrl: true,
        role: true,
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

    const accessToken = this.accessTokenFor(user.id, user.username, user.role);
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
      include: { user: { select: { id: true, username: true, role: true } } },
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
        role: current.user.role,
      };
    });

    const accessToken = this.accessTokenFor(
      next.userId,
      next.username,
      next.role,
    );
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

  async requestEmailChange(userId: number, nextEmail: string): Promise<void> {
    const newEmail = this.normalizeEmail(nextEmail);
    if (!newEmail) throw new ConflictException('변경할 이메일을 입력해주세요.');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });
    if (!user) throw new UnauthorizedException();

    const currentEmail = this.normalizeEmail(user.email ?? '');
    if (currentEmail && currentEmail === newEmail) {
      throw new ConflictException('현재 이메일과 동일합니다.');
    }

    const exists = await this.prisma.user.findUnique({
      where: { email: newEmail },
      select: { id: true },
    });
    if (exists) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    for (const [k, v] of this.emailChangeTokenMap.entries()) {
      if (v.userId === userId && !v.usedAt) this.emailChangeTokenMap.delete(k);
    }

    const rawToken = this.newOpaqueToken(48);
    const tokenHash = this.sha256(rawToken);
    const expiresAt = Date.now() + this.emailChangeMinutes() * 60_000;
    this.emailChangeTokenMap.set(tokenHash, { userId, newEmail, expiresAt });

    const verifyUrl = `${this.backendUrl()}/auth/email-change/verify?token=${encodeURIComponent(rawToken)}`;

    try {
      await this.mailer.sendEmailChangeVerify(newEmail, verifyUrl);
    } catch (err: unknown) {
      this.logger.error(
        'requestEmailChange send failed',
        this.errToString(err),
      );

      if ((process.env.NODE_ENV ?? 'development') !== 'production') {
        this.logger.warn(
          `[DEV] Email change link for user=${userId}, email=${newEmail}: ${verifyUrl}`,
        );
      }

      if (this.mailRequired()) {
        throw new ServiceUnavailableException(
          '이메일 발송 설정이 올바르지 않습니다. 서버 MAIL 설정을 확인해주세요.',
        );
      }
    }
  }

  async confirmEmailChange(token: string): Promise<void> {
    const raw = (token ?? '').trim();
    if (!raw) throw new ForbiddenException('유효하지 않은 토큰입니다.');

    const tokenHash = this.sha256(raw);
    const ticket = this.emailChangeTokenMap.get(tokenHash);
    if (!ticket) throw new ForbiddenException('유효하지 않은 토큰입니다.');
    if (ticket.usedAt) throw new ForbiddenException('이미 사용된 토큰입니다.');
    if (ticket.expiresAt <= Date.now()) {
      this.emailChangeTokenMap.delete(tokenHash);
      throw new ForbiddenException('만료된 토큰입니다.');
    }

    const exists = await this.prisma.user.findUnique({
      where: { email: ticket.newEmail },
      select: { id: true },
    });
    if (exists && exists.id !== ticket.userId) {
      throw new ConflictException('이미 사용 중인 이메일입니다.');
    }

    await this.prisma.user.update({
      where: { id: ticket.userId },
      data: {
        email: ticket.newEmail,
        emailVerifiedAt: new Date(),
      },
    });

    this.emailChangeTokenMap.set(tokenHash, {
      ...ticket,
      usedAt: Date.now(),
    });
  }

  async requestEmailAuth(
    email: string,
    opts?: { resend?: boolean },
  ): Promise<LoginResult | null> {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return null;
    if (opts?.resend) this.enforceEmailAuthResendLimit(normalized);

    const existing = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        profileImageUrl: true,
        role: true,
        emailVerifiedAt: true,
      },
    });

    // 관리자 계정은 링크 발송 없이 즉시 로그인 허용
    if (existing && String(existing.role ?? '').toUpperCase() === 'ADMIN') {
      const accessToken = this.accessTokenFor(
        existing.id,
        existing.username,
        existing.role,
      );
      const { refreshToken, expiresAt } = await this.issueRefreshToken(
        existing.id,
        {},
      );

      return {
        user: this.safeUser(existing),
        accessToken,
        refreshToken,
        refreshExpiresAt: expiresAt,
      };
    }

    const raw = await this.issueEmailAuthToken(normalized, existing?.id);
    const authUrl = `${this.frontendUrl()}/email-auth?token=${encodeURIComponent(raw)}`;

    try {
      await this.mailer.sendEmailAuthLink(
        normalized,
        authUrl,
        existing?.id ? 'login' : 'signup',
      );
    } catch (err: unknown) {
      this.logger.error('requestEmailAuth send failed', this.errToString(err));

      if ((process.env.NODE_ENV ?? 'development') !== 'production') {
        this.logger.warn(`[DEV] Email auth link for ${normalized}: ${authUrl}`);
      }

      if (this.mailRequired()) {
        throw new ServiceUnavailableException(
          '이메일 발송 설정이 올바르지 않습니다. 서버 MAIL 설정을 확인해주세요.',
        );
      }
    }
    return null;
  }

  async completeEmailAuth(
    token: string,
    meta: { ip?: string; userAgent?: string },
  ): Promise<LoginResult> {
    const raw = (token ?? '').trim();
    if (!raw) throw new ForbiddenException('유효하지 않은 토큰입니다.');

    const tokenHash = this.sha256(raw);

    const sessionUser = await this.prisma.$transaction(async (tx) => {
      const record = await tx.emailAuthToken.findUnique({
        where: { tokenHash },
      });

      if (!record) throw new ForbiddenException('유효하지 않은 토큰입니다.');
      if (record.usedAt)
        throw new ForbiddenException('이미 사용된 토큰입니다.');
      if (record.expiresAt.getTime() <= Date.now()) {
        throw new ForbiddenException('만료된 토큰입니다.');
      }

      await tx.emailAuthToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      const email = this.normalizeEmail(record.email);
      let isNewUser = false;

      let user = await tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          username: true,
          email: true,
          nickname: true,
          profileImageUrl: true,
          role: true,
          emailVerifiedAt: true,
        },
      });

      if (!user) {
        const username = await this.makeUniqueUsernameByEmail(tx, email);
        const passwordHash = await argon2.hash(this.newOpaqueToken(32), {
          type: argon2.argon2id,
        });

        user = await tx.user.create({
          data: {
            username,
            email,
            nickname: null,
            profileImageUrl: null,
            passwordHash,
            emailVerifiedAt: new Date(),
          },
          select: {
            id: true,
            username: true,
            email: true,
            nickname: true,
            profileImageUrl: true,
            role: true,
            emailVerifiedAt: true,
          },
        });
        isNewUser = true;
      } else if (!user.emailVerifiedAt) {
        user = await tx.user.update({
          where: { id: user.id },
          data: { emailVerifiedAt: new Date() },
          select: {
            id: true,
            username: true,
            email: true,
            nickname: true,
            profileImageUrl: true,
            role: true,
            emailVerifiedAt: true,
          },
        });
      }

      return { user, isNewUser };
    });

    const accessToken = this.accessTokenFor(
      sessionUser.user.id,
      sessionUser.user.username,
      sessionUser.user.role,
    );
    const { refreshToken, expiresAt } = await this.issueRefreshToken(
      sessionUser.user.id,
      meta,
    );

    return {
      user: this.safeUser(sessionUser.user),
      accessToken,
      refreshToken,
      refreshExpiresAt: expiresAt,
      isNewUser: sessionUser.isNewUser,
    };
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
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        profileImageUrl: true,
        role: true,
      },
    });
    if (!user) throw new UnauthorizedException();
    return this.safeUser(user);
  }

  private parseProfileImageUrl(value: string | undefined): string | null {
    const raw = (value ?? '').trim();
    if (!raw) return null;

    if (raw.startsWith('data:image/')) {
      if (raw.length > 2_000_000) {
        throw new ConflictException(
          '이미지 크기가 너무 큽니다. 1MB 이하로 업로드해주세요.',
        );
      }
      return raw;
    }

    if (raw.length > 500) {
      throw new ConflictException('프로필 이미지 주소가 너무 깁니다.');
    }

    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      throw new ConflictException('올바른 이미지 주소를 입력해주세요.');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new ConflictException('이미지 주소는 http/https만 지원합니다.');
    }

    return parsed.toString();
  }

  async updateProfile(
    userId: number,
    input: { nickname?: string; profileImageUrl?: string },
  ): Promise<SafeUser> {
    const nicknameRaw = (input.nickname ?? '').trim();
    const nickname = nicknameRaw
      ? nicknameRaw
      : await this.makeUniqueUnknownNickname(
          { user: this.prisma.user },
          userId,
        );
    const profileImageUrl = this.parseProfileImageUrl(input.profileImageUrl);

    if (nickname) this.validateNicknameFormat(nickname);

    if (nickname) {
      const existing = await this.prisma.user.findFirst({
        where: {
          id: { not: userId },
          OR: [{ username: nickname }, { nickname }],
        },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('이미 사용 중인 닉네임입니다.');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname,
        profileImageUrl,
      },
      select: {
        id: true,
        username: true,
        email: true,
        nickname: true,
        profileImageUrl: true,
        role: true,
      },
    });

    return this.safeUser(updated);
  }

  async getActiveSessions(
    userId: number,
    currentRefreshToken: string | null,
  ): Promise<
    Array<{
      id: number;
      ip: string | null;
      userAgent: string | null;
      createdAt: Date;
      expiresAt: Date;
      isCurrent: boolean;
    }>
  > {
    const now = new Date();
    const currentHash = currentRefreshToken
      ? this.sha256(currentRefreshToken)
      : null;

    const rows = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ createdAt: 'desc' }],
      select: {
        id: true,
        ip: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        tokenHash: true,
      },
    });

    return rows.map((row) => ({
      id: row.id,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt,
      expiresAt: row.expiresAt,
      isCurrent: !!currentHash && row.tokenHash === currentHash,
    }));
  }

  async revokeOtherSessions(
    userId: number,
    currentRefreshToken: string | null,
  ): Promise<number> {
    const now = new Date();
    const currentHash = currentRefreshToken
      ? this.sha256(currentRefreshToken)
      : null;

    const res = await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        expiresAt: { gt: now },
        ...(currentHash ? { tokenHash: { not: currentHash } } : {}),
      },
      data: { revokedAt: now },
    });

    return res.count;
  }

  async deleteAccount(
    userId: number,
    input: { email: string; confirmText: string },
  ): Promise<void> {
    const confirmText = (input.confirmText ?? '').trim();
    if (confirmText !== '계정 탈퇴') {
      throw new ConflictException('확인 문구를 정확히 입력해주세요.');
    }

    const inputEmail = this.normalizeEmail(input.email ?? '');
    if (!inputEmail) {
      throw new ConflictException('가입한 이메일을 입력해주세요.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true },
    });
    if (!user) throw new UnauthorizedException();

    const userEmail = this.normalizeEmail(user.email ?? '');
    if (!userEmail) {
      throw new ConflictException('이 계정은 이메일 정보가 없습니다.');
    }
    if (userEmail !== inputEmail) {
      throw new UnauthorizedException('이메일이 일치하지 않습니다.');
    }

    await this.prisma.user.delete({ where: { id: userId } });
  }

  async cancelEmailAuthSignup(userId: number): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, nickname: true },
    });
    if (!user) return;

    const hasNickname = !!String(user.nickname ?? '').trim();
    if (hasNickname) {
      throw new ConflictException('이미 가입이 완료된 계정입니다.');
    }

    await this.prisma.user.delete({ where: { id: userId } });
  }
}
