import TTLCache from '@isaacs/ttlcache'
import type { CacheStore } from 'baileys'

// Default TTL is 24 hours, set at the milisecond level
const DEFAULT_TTL = 24 * 60 * 60 * 1000

export class TTLCacheStore implements CacheStore {
  private cache: TTLCache<string, unknown>

  constructor(ttlMilliseconds: number = DEFAULT_TTL) {
    this.cache = new TTLCache({ ttl: ttlMilliseconds })
  }

  get<T>(key: string): T | undefined {
    return this.cache.get(key)
  }

  set<T>(key: string, value: T): void {
    this.cache.set(key, value)
  }

  del(key: string): void {
    this.cache.delete(key)
  }

  flushAll(): void {
    this.cache.clear()
  }
}
