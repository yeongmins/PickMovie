// backend/src/prisma/prisma.service.ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import * as fs from 'fs';
import * as path from 'path';

// ✅ 타입은 기존 generated client 기준 유지 (다른 파일들 타입 연쇄 깨짐 방지)
import type { PrismaClient as GeneratedPrismaClient } from '../generated/prisma';

type PrismaClientCtor = new (options?: unknown) => GeneratedPrismaClient;

function tryRequirePrismaClient(modulePath: string): PrismaClientCtor | null {
  try {
    // ✅ ESLint: require()는 금지지만, 런타임 경로 탐색을 위해 여기만 예외 처리
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(modulePath) as { PrismaClient?: PrismaClientCtor };
    return mod?.PrismaClient ?? null;
  } catch {
    return null;
  }
}

/**
 * ✅ dist 실행 시점에 dist/src/generated/prisma가 없어서 터지는 문제 해결
 * - dist에 복사되어 있으면 dist 쪽 사용
 * - 없으면 repo의 src/generated/prisma를 직접 로드(로컬 개발)
 * - 최후 fallback: @prisma/client
 */
function resolvePrismaClientCtor(): PrismaClientCtor {
  // backend 기준 루트 경로 (src에서도 dist에서도 동일하게 backend를 가리킴)
  const backendRoot = path.resolve(__dirname, '..', '..', '..');

  const candidates = [
    path.join(backendRoot, 'dist', 'src', 'generated', 'prisma'),
    path.join(backendRoot, 'src', 'generated', 'prisma'),
    // 실행 위치(cwd)가 backend가 아닐 수도 있어서 추가 시도
    path.join(process.cwd(), 'dist', 'src', 'generated', 'prisma'),
    path.join(process.cwd(), 'src', 'generated', 'prisma'),
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const ctor = tryRequirePrismaClient(p);
      if (ctor) return ctor;
    }
  }

  // 마지막 fallback (환경에 따라 존재할 수도 있음)
  const fallback = tryRequirePrismaClient('@prisma/client');
  if (fallback) return fallback;

  throw new Error(
    [
      'Cannot load PrismaClient.',
      '- Run: npx prisma generate',
      '- Ensure Prisma client exists at: backend/src/generated/prisma',
      '- Or ensure it is copied to: backend/dist/src/generated/prisma',
    ].join('\n'),
  );
}

const PrismaClientBase = resolvePrismaClientCtor();

@Injectable()
export class PrismaService
  extends PrismaClientBase
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not set. Check backend/.env');
    }

    super({
      adapter: new PrismaPg({ connectionString }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
