// backend/src/main.ts
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({ origin: true, credentials: true });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  await app.listen(port);

  new Logger('Bootstrap').log(`Backend running on http://localhost:${port}`);
}

// ✅ Promise 처리 (catch) => no-floating-promises 해결 :contentReference[oaicite:8]{index=8}
bootstrap().catch((err) => {
  new Logger('Bootstrap').error(err);
});
