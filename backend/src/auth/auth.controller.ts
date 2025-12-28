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
import type { CookieOptions, Request, Response } from 'express';
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

type FavoriteItem = { id: number; mediaType: 'movie' | 'tv' };
type CreatePlaylistBody = { name: string; items: FavoriteItem[] };
type DeletePlaylistBody = { playlistId: number };

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

  private cookieOptions(): CookieOptions {
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

    const sameSite: CookieOptions['sameSite'] =
      sameSiteEnv === 'none'
        ? 'none'
        : sameSiteEnv === 'strict'
          ? 'strict'
          : 'lax';

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
   * ✅ 쿠키 파서(req.cookies) 의존 제거
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

  @Post('check-username')
  async checkUsername(@Body() body: { username?: string; value?: string }) {
    const v = (body?.username ?? body?.value ?? '').trim();
    const available = await this.auth.isUsernameAvailable(v);
    return { available, isAvailable: available };
  }

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

  @Post('email/verify')
  async verifyEmail(@Body('token') token: string): Promise<ApiOk> {
    await this.auth.verifyEmail(token);
    return { ok: true };
  }

  @Post('password/forgot')
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
    @Req() req: Request,
  ): Promise<ApiOk> {
    const meta = this.getClientMeta(req);
    await this.auth.requestPasswordReset(dto.identifier, meta.ip);
    return { ok: true };
  }

  @Post('password/reset')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<ApiOk> {
    await this.auth.resetPassword(dto.token, dto.newPassword);
    return { ok: true };
  }

  @Post('username/lookup')
  async usernameLookup(
    @Body() dto: UsernameLookupDto,
    @Req() req: Request,
  ): Promise<ApiOk> {
    const meta = this.getClientMeta(req);
    await this.auth.requestUsernameByEmail(dto.email, meta.ip);
    return { ok: true };
  }

  @UseGuards(JwtAccessGuard)
  @Get('me')
  async me(@CurrentUser() user: JwtAccessPayload | null) {
    if (!user) return { user: null };
    const me = await this.auth.me(user.sub);
    return { user: me };
  }

  // =========================
  // ✅ Favorites (DB only)
  // =========================
  @UseGuards(JwtAccessGuard)
  @Get('favorites')
  async favorites(@CurrentUser() user: JwtAccessPayload) {
    const items = await this.auth.getFavorites(user.sub);
    return { items };
  }

  @UseGuards(JwtAccessGuard)
  @Post('favorites/set')
  async setFavorite(
    @CurrentUser() user: JwtAccessPayload,
    @Body()
    body: { id?: number; mediaType?: 'movie' | 'tv'; isFavorite?: boolean },
  ) {
    const id = Number(body?.id);
    const mediaType = body?.mediaType === 'tv' ? 'tv' : 'movie';
    const isFavorite = Boolean(body?.isFavorite);

    if (!Number.isFinite(id) || id <= 0) {
      throw new BadRequestException('id is required');
    }

    await this.auth.setFavorite(user.sub, id, mediaType, isFavorite);
    return { ok: true };
  }

  @UseGuards(JwtAccessGuard)
  @Post('favorites/sync')
  async syncFavorites(
    @CurrentUser() user: JwtAccessPayload,
    @Body() body: { items?: FavoriteItem[] },
  ) {
    const items = Array.isArray(body?.items) ? body.items : [];
    const saved = await this.auth.syncFavorites(user.sub, items);
    return { items: saved };
  }

  // =========================
  // ✅ Playlists (DB only)
  // =========================
  @UseGuards(JwtAccessGuard)
  @Get('playlists')
  async playlists(@CurrentUser() user: JwtAccessPayload) {
    const playlists = await this.auth.getPlaylists(user.sub);
    return { playlists };
  }

  @UseGuards(JwtAccessGuard)
  @Post('playlists/create')
  async createPlaylist(
    @CurrentUser() user: JwtAccessPayload,
    @Body() body: CreatePlaylistBody,
  ) {
    const name = (body?.name ?? '').trim();
    const items = Array.isArray(body?.items) ? body.items : [];

    if (!name) throw new BadRequestException('name is required');
    if (items.length === 0) throw new BadRequestException('items is required');

    const playlist = await this.auth.createPlaylist(user.sub, name, items);
    return { playlist };
  }

  @UseGuards(JwtAccessGuard)
  @Post('playlists/delete')
  async deletePlaylist(
    @CurrentUser() user: JwtAccessPayload,
    @Body() body: DeletePlaylistBody,
  ) {
    const playlistId = Number(body?.playlistId);
    if (!Number.isFinite(playlistId) || playlistId <= 0) {
      throw new BadRequestException('playlistId is required');
    }

    await this.auth.deletePlaylist(user.sub, playlistId);
    return { ok: true };
  }
}
