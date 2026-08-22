import { Redis } from '@upstash/redis';

let redis: Redis | undefined;
let redisConfigSignature: string | undefined;

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

// In-memory storage is intentionally limited to development/test environments.
const devMemoryStore = new Map<string, RateLimitRecord>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  storageUnavailable?: boolean;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

function getRedisClient(): Redis | undefined {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();
  const signature = url && token ? `${url}\u0000${token}` : '';

  // Tests and runtime configuration can change env values between requests.
  // Never retain a client created for a previous credential set.
  if (signature !== redisConfigSignature) {
    redis = undefined;
    redisConfigSignature = signature;
  }

  if (!url || !token) return undefined;
  if (!redis) {
    redis = new Redis({ url, token });
  }
  return redis;
}

function unavailableResult(now: number, windowMs: number): RateLimitResult {
  return {
    allowed: false,
    remaining: 0,
    resetAt: now + windowMs,
    storageUnavailable: true,
  };
}

/**
 * Checks and increments a rate-limit counter.
 *
 * Production always requires the shared Redis store. Missing or failed Redis
 * access fails closed; the development/test Map is never used in production.
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const client = getRedisClient();
  const now = Date.now();
  const windowMs = windowSeconds * 1000;

  if (client) {
    try {
      const current = Number(await client.incr(key));
      if (current === 1) {
        await client.expire(key, windowSeconds);
      }
      const ttl = Number(await client.ttl(key));
      const resetAt = now + (ttl > 0 ? ttl * 1000 : windowMs);
      return {
        allowed: current <= maxAttempts,
        remaining: Math.max(0, maxAttempts - current),
        resetAt,
      };
    } catch {
      console.error('Shared rate limit store error');
      if (isProduction()) {
        return unavailableResult(now, windowMs);
      }
    }
  }

  if (isProduction()) {
    console.error('Shared rate limit storage is required in production');
    return unavailableResult(now, windowMs);
  }

  const record = devMemoryStore.get(key);
  if (!record || record.resetAt < now) {
    const resetAt = now + windowMs;
    devMemoryStore.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: Math.max(0, maxAttempts - 1),
      resetAt,
    };
  }

  record.count += 1;
  return {
    allowed: record.count <= maxAttempts,
    remaining: Math.max(0, maxAttempts - record.count),
    resetAt: record.resetAt,
  };
}

export async function getFailedAttempts(key: string): Promise<number> {
  const client = getRedisClient();

  if (client) {
    try {
      return Number((await client.get<number>(key)) || 0);
    } catch {
      console.error('Shared rate limit store error');
      if (isProduction()) return 999;
    }
  }

  if (isProduction()) return 999;

  const record = devMemoryStore.get(key);
  if (!record || record.resetAt < Date.now()) return 0;
  return record.count;
}

export async function recordFailedAttempt(
  key: string,
  windowSeconds: number = 15 * 60
): Promise<number> {
  const client = getRedisClient();
  const now = Date.now();

  if (client) {
    try {
      const count = Number(await client.incr(key));
      if (count === 1) await client.expire(key, windowSeconds);
      return count;
    } catch {
      console.error('Shared rate limit store error');
      if (isProduction()) return 999;
    }
  }

  if (isProduction()) return 999;

  const record = devMemoryStore.get(key);
  if (!record || record.resetAt < now) {
    devMemoryStore.set(key, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return 1;
  }

  record.count += 1;
  return record.count;
}

export async function resetRateLimit(key: string): Promise<void> {
  const client = getRedisClient();
  if (client) {
    try {
      await client.del(key);
    } catch {
      console.error('Shared rate limit store error');
    }
  }
  devMemoryStore.delete(key);
}
