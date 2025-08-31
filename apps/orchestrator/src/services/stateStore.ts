// Simple state store with TTL and consume-once semantics.
// In production, back this with Redis. For now, in-memory map.

type StateRecord = {
  value: any;
  expiresAt: number; // epoch ms
  used: boolean;
};

class InMemoryStateStore {
  private store = new Map<string, StateRecord>();
  private cleaner: NodeJS.Timeout;

  constructor() {
    this.cleaner = setInterval(() => this.sweep(), 60_000);
    this.cleaner.unref?.();
  }

  async set(key: string, value: any, ttlMs: number) {
    const expiresAt = Date.now() + ttlMs;
    this.store.set(key, { value, expiresAt, used: false });
  }

  async get(key: string): Promise<any | null> {
    const rec = this.store.get(key);
    if (!rec) return null;
    if (rec.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return rec.value;
  }

  async consume(key: string): Promise<any | null> {
    const rec = this.store.get(key);
    if (!rec) return null;
    if (rec.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    if (rec.used) return null;
    rec.used = true;
    return rec.value;
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt <= now) this.store.delete(k);
    }
  }
}

export const stateStore = new InMemoryStateStore();

