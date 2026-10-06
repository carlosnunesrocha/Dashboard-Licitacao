import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * Cache de oportunidades entre portais e o banco principal.
 *
 * Tenta conectar ao Redis (REDIS_URL). Se Redis não estiver disponível
 * (ambiente local sem Docker, etc.), cai automaticamente para um cache
 * em memória com os mesmos TTLs (24h para oportunidades).
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  /** Cliente Redis real — null se não conseguir conectar. */
  private client: Redis | null = null;

  /** Fallback em memória quando Redis não está disponível. */
  private memoryCache = new Map<string, { value: string; expiresAt: number }>();

  onModuleInit() {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    try {
      const redis = new Redis(url);
      redis.on('error', () => {});
      redis.on('connect', () => this.logger.log('Redis conectado'));
      this.client = redis;
    } catch {
      this.logger.warn('Redis offline — usando cache em memória (TTL 24h)');
    }
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  /** Verdadeiro se está usando Redis real, false se é fallback em memória. */
  get isRedis(): boolean {
    return this.client !== null;
  }

  private cleanupMemory() {
    const now = Date.now();
    for (const [key, entry] of this.memoryCache) {
      if (entry.expiresAt <= now) this.memoryCache.delete(key);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.client) {
      try {
        const raw = await this.client.get(key);
        if (raw === null) return null;
        try {
          return JSON.parse(raw) as T;
        } catch {
          return raw as T;
        }
      } catch {
        return null;
      }
    }

    // Fallback em memória
    this.cleanupMemory();
    const entry = this.memoryCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.memoryCache.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch {
      return entry.value as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds = 86400): Promise<void> {
    if (this.client) {
      try {
        const serialized = typeof value === 'string' ? value : JSON.stringify(value);
        await this.client.setex(key, ttlSeconds, serialized);
        return;
      } catch {
        // falha silenciosa — cai para memória
      }
    }

    // Fallback em memória
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    this.memoryCache.set(key, {
      value: serialized,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async del(key: string | string[]): Promise<number> {
    if (this.client) {
      try {
        const keys = Array.isArray(key) ? key : [key];
        return await this.client.del(...keys);
      } catch {
        // cai para memória
      }
    }

    const keys = Array.isArray(key) ? key : [key];
    let count = 0;
    for (const k of keys) {
      if (this.memoryCache.delete(k)) count++;
    }
    return count;
  }

  async keys(pattern: string): Promise<string[]> {
    if (this.client) {
      try {
        return await this.client.keys(pattern);
      } catch {
        // cai para memória
      }
    }

    // Fallback: lista todas as chaves que fazem match no padrão
    this.cleanupMemory();
    const prefix = pattern.replace('*', '');
    return Array.from(this.memoryCache.keys()).filter((k) => k.startsWith(prefix));
  }
}
