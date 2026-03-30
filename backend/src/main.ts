// backend/src/main.ts
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json, urlencoded, type Express } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { AppModule } from './app.module';

function parseOrigins(raw: string | undefined): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTrustProxy(
  raw: string | undefined,
): boolean | number | string {
  const v = String(raw ?? '0').trim().toLowerCase();
  if (!v || v === '0' || v === 'false' || v === 'no' || v === 'off')
    return false;
  if (v === 'true' || v === 'yes' || v === 'on') return true;
  const n = Number(v);
  if (Number.isFinite(n) && n >= 1) return Math.floor(n);
  return v;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // 프록시(https) 환경에서 쿠키/클라이언트 IP 정상 처리 (Render/Railway/Fly 등)
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.disable('x-powered-by');
  expressApp.set('trust proxy', parseTrustProxy(process.env.TRUST_PROXY));
  expressApp.use(json({ limit: '5mb' }));
  expressApp.use(urlencoded({ extended: true, limit: '5mb' }));
  expressApp.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  const rateLimitWindowMs = Math.min(
    60 * 60 * 1000,
    Math.max(1_000, Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000)),
  );
  const rateLimitMax = Math.min(
    1_000,
    Math.max(10, Number(process.env.RATE_LIMIT_MAX ?? 120)),
  );
  const apiLimiter = rateLimit({
    windowMs: rateLimitWindowMs,
    max: rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  });
  expressApp.use(['/auth', '/analytics', '/admin'], apiLimiter);

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const rawCorsOrigins = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN;
  const parsedOrigins = parseOrigins(rawCorsOrigins);
  const origins =
    parsedOrigins.length > 0
      ? parsedOrigins
      : ['http://localhost:5173', 'http://127.0.0.1:5173'];
  const nodeEnv = String(process.env.NODE_ENV ?? '')
    .trim()
    .toLowerCase();
  if (nodeEnv === 'production' && parsedOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must be set in production');
  }

  app.enableCors({
    origin: origins,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
