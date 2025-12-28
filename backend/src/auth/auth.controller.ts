// backend/src/auth/auth.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UsernameLookupDto } from './dto/username-lookup.dto';
import { JwtAccessGuard } from './guards/jwt-access.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import type { JwtAccessPayload } from './strategies/jwt-access.strategy';

type ApiOk = { ok: true };

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  private frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:5173';
  }

  private isProd(): boolean {
    return (process.env.NODE_ENV ?? 'development') === 'production';
  }

  private refreshCookieName(): string {
    return this.config.get<string>('COOKIE_NAME_REFRESH') ?? 'refresh_token';
  }

  private cookieOptions() {
    const secureEnv = this.config.get<string>('COOKIE_SECURE');
    const secure =
      secureEnv === 'true'
        ? true
        : secureEnv === 'false'
          ? false
          : this.isProd();

    const sameSiteEnv = (
      this.config.get<string>('COOKIE_SAMESITE') ?? 'lax'
    ).toLowerCase();

    const sameSite =
      sameSiteEnv === 'none'
        ? ('none' as const)
        : sameSiteEnv === 'strict'
          ? ('strict' as const)
          : ('lax' as const);

    const domain = (this.config.get<string>('COOKIE_DOMAIN') ?? '').trim();

    return {
      httpOnly: true,
      secure,
      sameSite,
      path: '/',
      ...(domain ? { domain } : {}),
    };
  }

  private setRefreshCookie(res: Response, token: string, expires: Date) {
    res.cookie(this.refreshCookieName(), token, {
      ...this.cookieOptions(),
      expires,
    });
  }

  private clearRefreshCookie(res: Response) {
    res.clearCookie(this.refreshCookieName(), { ...this.cookieOptions() });
  }

  private getClientMeta(req: Request): { ip?: string; userAgent?: string } {
    const xff = req.headers['x-forwarded-for'];
    const ip =
      typeof xff === 'string'
        ? xff.split(',')[0]?.trim()
        : Array.isArray(xff)
          ? xff[0]?.trim()
          : (req.socket.remoteAddress ?? undefined);

    const ua = req.headers['user-agent'];
    const userAgent = typeof ua === 'string' ? ua : undefined;

    return { ip, userAgent };
  }

  /**
   * ✅ 쿠키 파서(req.cookies) 의존 제거 (타입/설정 꼬임 방지)
   * - Cookie 헤더를 직접 파싱해서 refresh 토큰을 찾음
   */
  private getRefreshFromCookie(req: Request): string | null {
    const header = req.headers.cookie;
    if (!header) return null;

    const target = this.refreshCookieName();

    const parts = header.split(';');
    for (const part of parts) {
      const p = part.trim();
      if (!p) continue;

      const eq = p.indexOf('=');
      if (eq < 0) continue;

      const k = decodeURIComponent(p.slice(0, eq).trim());
      if (k !== target) continue;

      const v = p.slice(eq + 1).trim();
      return v ? decodeURIComponent(v) : null;
    }

    return null;
  }

  /**
   * ✅ 프론트에서 호출하는 엔드포인트 (404 해결)
   * - body 키가 프로젝트마다 달라서 호환되게 받음: nickname | username | value
   * - 내부에서는 username/nickname 둘 다 중복 체크해서 안전하게 처리
   */
  @Post('check-nickname')
  async checkNickname(
    @Body()
    body: {
      nickname?: string;
      username?: string;
      value?: string;
    },
  ) {
    const raw = (body.nickname ?? body.username ?? body.value ?? '').trim();
    if (!raw) throw new BadRequestException('nickname is required');

    const available = await this.auth.isNicknameAvailable(raw);
    return { available };
  }

  // ✅ 프론트: POST /auth/check-username
  @Post('check-username')
  async checkUsername(@Body() body: { username?: string; value?: string }) {
    const v = (body?.username ?? body?.value ?? '').trim();
    const available = await this.auth.isUsernameAvailable(v);

    // 프론트 구현이 어떤 키를 보든 대응 가능하게 2개 같이 반환
    return { available, isAvailable: available };
  }

  // ✅ 프론트: POST /auth/register
  @Post('register')
  async register(@Body() dto: SignupDto) {
    const user = await this.auth.signup(dto);
    return { user };
  }

  @Post('signup')
  async signup(@Body() dto: SignupDto) {
    const user = await this.auth.signup(dto);
    return { user };
  }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const meta = this.getClientMeta(req);
    const result = await this.auth.login(dto, meta);

    this.setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refresh = this.getRefreshFromCookie(req);
    if (!refresh) return { ok: true, accessToken: null };

    const meta = this.getClientMeta(req);
    const rotated = await this.auth.refresh(refresh, meta);

    this.setRefreshCookie(res, rotated.refreshToken, rotated.refreshExpiresAt);

    return { accessToken: rotated.accessToken };
  }

  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ApiOk> {
    const refresh = this.getRefreshFromCookie(req);
    if (refresh) await this.auth.logout(refresh);

    this.clearRefreshCookie(res);
    return { ok: true };
  }

  // ✅ 이메일 인증 메일 재발송
  @Post('email/request-verification')
  async requestEmailVerification(@Body('email') email: string): Promise<ApiOk> {
    await this.auth.requestEmailVerification(email);
    return { ok: true };
  }

  @Get('email/verify')
  async verifyEmailByLink(@Query('token') token: string, @Res() res: Response) {
    if (!token?.trim()) throw new BadRequestException('token is required');

    await this.auth.verifyEmail(token);

    const fe = this.frontendUrl();
    return res.redirect(302, `${fe}/login?verified=1`);
  }

  // ✅ 이메일 인증 토큰 검증
  @Post('email/verify')
  async verifyEmail(@Body('token') token: string): Promise<ApiOk> {
    await this.auth.verifyEmail(token);
    return { ok: true };
  }

  @Post('password/forgot')
  async forgotPassword(@Body() dto: ForgotPasswordDto): Promise<ApiOk> {
    await this.auth.requestPasswordReset(dto.identifier);
    return { ok: true };
  }

  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<ApiOk> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { ok: true };
  }

  @Post('username/lookup')
  async usernameLookup(@Body() dto: UsernameLookupDto): Promise<ApiOk> {
    await this.auth.requestUsernameByEmail(dto.email);
    return { ok: true };
  }

  @UseGuards(JwtAccessGuard)
  @Get('me')
  async me(@CurrentUser() user: JwtAccessPayload | null) {
    if (!user) return { user: null };
    const me = await this.auth.me(user.sub);
    return { user: me };
  }
}
