// Simple in-memory interaction lock. In production, back with Redis.
type LockRecord = { expiresAt: number };

class InMemoryLock {
  private locks = new Map<string, LockRecord>();
  private ttlMs: number;

  constructor(ttlMs = 5000) {
    this.ttlMs = ttlMs;
    const timer = setInterval(() => this.sweep(), 1000);
    (timer as any).unref?.();
  }

  async acquire(key: string, ttlMs = this.ttlMs): Promise<boolean> {
    const now = Date.now();
    const rec = this.locks.get(key);
    if (rec && rec.expiresAt > now) return false;
    this.locks.set(key, { expiresAt: now + ttlMs });
    return true;
  }

  async release(key: string): Promise<void> {
    this.locks.delete(key);
  }

  private sweep() {
    const now = Date.now();
    for (const [k, v] of this.locks.entries()) {
      if (v.expiresAt <= now) this.locks.delete(k);
    }
  }
}

export const interactionLock = new InMemoryLock(5000);

