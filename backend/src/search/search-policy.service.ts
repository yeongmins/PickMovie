import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const POLICY_KEY = 'default';

const DEFAULT_SENSITIVE_KEYWORDS = [
  '성인물',
  '성인 영상',
  '음란',
  '노출',
  '섹스',
  '야동',
  '포르노',
  '자위',
  '강간',
  '씨발',
  '시발',
  '병신',
  '좆',
  'fuck',
  'bitch',
  'asshole',
  'porn',
  'sex',
  'nsfw',
];

function normalizeKeyword(v: unknown): string | null {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  if (!s) return null;
  return s;
}

function normalizeKeywords(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const it of values) {
    const k = normalizeKeyword(it);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}

@Injectable()
export class SearchPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async getSensitiveKeywords(): Promise<{
    keywords: string[];
    updatedAt: string | null;
  }> {
    try {
      const row = await (this.prisma as any).searchPolicyConfig.findUnique({
        where: { key: POLICY_KEY },
        select: {
          blockedKeywords: true,
          updatedAt: true,
        },
      });

      const keywords = normalizeKeywords(row?.blockedKeywords);
      if (keywords.length > 0) {
        return {
          keywords,
          updatedAt: row?.updatedAt?.toISOString?.() ?? null,
        };
      }
    } catch {
      // keep default fallback when table is not migrated yet
    }

    return {
      keywords: [...DEFAULT_SENSITIVE_KEYWORDS],
      updatedAt: null,
    };
  }

  async setSensitiveKeywords(args: {
    keywords: string[];
    updatedBy?: string;
  }): Promise<{ keywords: string[]; updatedAt: string | null }> {
    const normalized = normalizeKeywords(args.keywords);
    const next =
      normalized.length > 0 ? normalized : [...DEFAULT_SENSITIVE_KEYWORDS];

    try {
      const row = await (this.prisma as any).searchPolicyConfig.upsert({
        where: { key: POLICY_KEY },
        update: {
          blockedKeywords: next,
          updatedBy: args.updatedBy ?? null,
          updatedAt: new Date(),
        },
        create: {
          key: POLICY_KEY,
          blockedKeywords: next,
          updatedBy: args.updatedBy ?? null,
          updatedAt: new Date(),
        },
        select: {
          blockedKeywords: true,
          updatedAt: true,
        },
      });

      return {
        keywords: normalizeKeywords(row.blockedKeywords),
        updatedAt: row.updatedAt.toISOString(),
      };
    } catch {
      return {
        keywords: next,
        updatedAt: null,
      };
    }
  }

  defaultKeywords(): string[] {
    return [...DEFAULT_SENSITIVE_KEYWORDS];
  }
}
