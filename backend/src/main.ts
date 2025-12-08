// backend/src/main.ts

import 'dotenv/config'; // ✅ .env 자동 로드 (가장 위쪽에)

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ['http://localhost:5173'], // Vite 프론트 주소
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`✅ Backend running on http://localhost:${port}`);
}

void bootstrap();
