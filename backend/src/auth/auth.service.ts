// backend/src/auth/auth.service.ts
import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
  ConflictException,
  ForbiddenException as NestForbiddenException,
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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

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
    // true면 메일 발송 실패 시 회원가입 자체를 실패 처리(운영용)
    // false면 개발환경에서 콘솔 링크로 대체(500 방지)
    const v = (
      this.config.get<string>('MAIL_REQUIRED') ?? 'false'
    ).toLowerCase();
    return v === 'true';
  }

  private backendUrl(): string {
    return this.config.get<string>('BACKEND_URL') ?? 'http://localhost:3000';
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

  // ✅ .env 키에 맞춤
  private refreshDays(): number {
    const n = Number(this.config.get<string>('JWT_REFRESH_TTL_DAYS') ?? '14');
    return Number.isFinite(n) && n > 0 ? n : 14;
  }

  // ✅ .env 키에 맞춤
  private resetMinutes(): number {
    const n = Number(
      this.config.get<string>('PASSWORD_RESET_TTL_MINUTES') ?? '15',
    );
    return Number.isFinite(n) && n > 0 ? n : 15;
  }

  // ✅ 이메일 인증 TTL(선택 env). 없으면 24시간
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
   * ✅ username만 중복 체크 (프론트 /auth/check-username 대응)
   */
  async isUsernameAvailable(username: string): Promise<boolean> {
    const u = (username ?? '').trim();
    if (!u) return false;

    const exists = await this.prisma.user.findUnique({
      where: { username: u },
      select: { id: true },
    });

    return !exists;
  }

  /**
   * ✅ 프론트 check-nickname 용
   * - 값 하나로 username/nickname 둘 다 중복 체크
   */
  async isNicknameAvailable(value: string): Promise<boolean> {
    const v = (value ?? '').trim();
    if (!v) return false;

    const exists = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: v }, { nickname: v }],
      },
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

    // 기존 토큰이 많이 쌓이지 않게 만료/미사용 토큰 정리
    await this.prisma.emailVerificationToken.deleteMany({
      where: { userId, usedAt: null },
    });

    await this.prisma.emailVerificationToken.create({
      data: { userId, tokenHash, expiresAt },
      select: { id: true },
    });

    return rawToken;
  }

  private frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
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

    // ✅ 이메일이 있으면 인증메일 자동 발송 (실패해도 개발환경에서는 흐름 유지)
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

    // ✅ 이메일이 있는 계정은 인증 완료 전 로그인 차단
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

  // ✅ 이메일 인증 메일 재발송 (메일 실패 시 500 방지 + DEV 링크 출력)
  async requestEmailVerification(email: string): Promise<void> {
    const e = (email ?? '').trim();
    if (!e) return;

    const user = await this.prisma.user.findUnique({
      where: { email: e },
      select: { id: true, email: true, emailVerifiedAt: true },
    });

    // 존재여부/상태 노출 방지: 항상 성공처럼
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

  // ✅ 이메일 인증 토큰 검증
  async verifyEmail(token: string): Promise<void> {
    const raw = (token ?? '').trim();
    if (!raw) throw new NestForbiddenException('유효하지 않은 토큰입니다.');

    const tokenHash = this.sha256(raw);

    const record = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, emailVerifiedAt: true } } },
    });

    if (!record) throw new NestForbiddenException('유효하지 않은 토큰입니다.');
    if (record.usedAt)
      throw new NestForbiddenException('이미 사용된 토큰입니다.');
    if (record.expiresAt.getTime() <= Date.now())
      throw new NestForbiddenException('만료된 토큰입니다.');

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });

      // 이미 인증된 계정이면 덮어쓰지 않음
      if (!record.user.emailVerifiedAt) {
        await tx.user.update({
          where: { id: record.user.id },
          data: { emailVerifiedAt: new Date() },
        });
      }
    });
  }

  async requestPasswordReset(identifier: string): Promise<void> {
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

    // user enumeration 방지: 항상 성공처럼
    if (!user || !user.email) return;

    const rawToken = this.newOpaqueToken(48);
    const tokenHash = this.sha256(rawToken);
    const expiresAt = new Date(Date.now() + this.resetMinutes() * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
    });

    const resetUrl = `${this.frontendUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await this.mailer.sendPasswordReset(user.email, resetUrl);
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

  async requestUsernameByEmail(email: string): Promise<void> {
    const e = email.trim();

    const user = await this.prisma.user.findUnique({
      where: { email: e },
      select: { username: true, email: true },
    });

    // user enumeration 방지
    if (!user || !user.email) return;

    await this.mailer.sendUsernameHint(user.email, user.username);
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
