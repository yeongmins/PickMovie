// backend/src/common/memoryCache.ts
export type MemoryCacheOptions = {
  defaultTtlMs?: number;
  negativeTtlMs?: number;
  maxEntries?: number;
};

type Entry<T> = {
  value: T;
  expiresAt: number;
};

export class MemoryCache {
  private readonly store = new Map<string, Entry<unknown>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  private readonly defaultTtlMs: number;
  private readonly negativeTtlMs: number;
  private readonly maxEntries: number;

  constructor(opts?: MemoryCacheOptions) {
    this.defaultTtlMs = opts?.defaultTtlMs ?? 1000 * 60 * 10; // 10분
    this.negativeTtlMs = opts?.negativeTtlMs ?? 1000 * 60 * 2; // 2분
    this.maxEntries = opts?.maxEntries ?? 2_000;
  }

  private now(): number {
    return Date.now();
  }

  private cleanupExpired(): void {
    const t = this.now();
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt <= t) this.store.delete(k);
    }
  }

  private ensureCapacity(): void {
    if (this.store.size <= this.maxEntries) return;

    const over = this.store.size - this.maxEntries;
    let i = 0;

    // Map insertion order: 오래된 것부터 제거
    for (const k of this.store.keys()) {
      this.store.delete(k);
      i += 1;
      if (i >= over) break;
    }
  }

  get<T>(key: string): T | undefined {
    const e = this.store.get(key);
    if (!e) return undefined;

    if (e.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return e.value as T;
  }

  set<T>(key: string, value: T, ttlMs?: number): void {
    this.cleanupExpired();

    const ttl =
      ttlMs ?? (value === null ? this.negativeTtlMs : this.defaultTtlMs);

    this.store.set(key, {
      value,
      expiresAt: this.now() + Math.max(1, ttl),
    });

    this.ensureCapacity();
  }

  delete(key: string): void {
    this.store.delete(key);
    this.inflight.delete(key);
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    opts?: { ttlMs?: number; negativeTtlMs?: number },
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const inFlight = this.inflight.get(key);
    if (inFlight) return (await inFlight) as T;

    const p: Promise<T> = (async () => {
      try {
        const v = await factory();
        const ttl =
          v === null
            ? (opts?.negativeTtlMs ?? this.negativeTtlMs)
            : (opts?.ttlMs ?? this.defaultTtlMs);
        this.set(key, v, ttl);
        return v;
      } finally {
        this.inflight.delete(key);
      }
    })();

    // ✅ Promise<T> 는 Promise<unknown> 에 그대로 들어갈 수 있음(불필요 캐스팅 제거)
    this.inflight.set(key, p);
    return await p;
  }
}
