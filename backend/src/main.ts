// backend/src/main.ts
import 'dotenv/config';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { json, urlencoded, type Express } from 'express';
import { AppModule } from './app.module';

function parseOrigins(raw: string | undefined): string[] {
  return String(raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // ✅ 프록시(https) 환경에서 쿠키/클라이언트 IP 정상 처리 (Render/Railway/Fly 등)
  const expressApp = app.getHttpAdapter().getInstance() as Express;
  expressApp.set('trust proxy', 1);
  expressApp.use(json({ limit: '5mb' }));
  expressApp.use(urlencoded({ extended: true, limit: '5mb' }));

  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  const origins =
    parseOrigins(process.env.CORS_ORIGINS).length > 0
      ? parseOrigins(process.env.CORS_ORIGINS)
      : ['http://localhost:5173', 'http://127.0.0.1:5173'];

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
