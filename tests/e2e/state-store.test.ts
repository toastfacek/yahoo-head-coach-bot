import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { stateStore } from '../../apps/orchestrator/src/services/stateStore';
import { sleep, waitFor } from '../utils/test-helpers';
import { TEST_USERS } from '../setup';

describe('State Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up all state records
    await stateStore.cleanAll?.() ?? Promise.resolve();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve values', async () => {
      const key = 'test-key';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID, data: 'test' };

      await stateStore.set(key, value, 5000);
      const retrieved = await stateStore.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent keys', async () => {
      const result = await stateStore.get('non-existent');
      expect(result).toBeNull();
    });

    it('should overwrite existing values', async () => {
      const key = 'overwrite-key';
      const value1 = { discordId: 'user1' };
      const value2 = { discordId: 'user2' };

      await stateStore.set(key, value1, 5000);
      await stateStore.set(key, value2, 5000);

      const retrieved = await stateStore.get(key);
      expect(retrieved).toEqual(value2);
    });
  });

  describe('TTL Behavior', () => {
    it('should expire records after TTL', async () => {
      const key = 'ttl-test';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await stateStore.set(key, value, 100); // 100ms TTL

      // Should be available immediately
      expect(await stateStore.get(key)).toEqual(value);

      // Wait for expiration
      await sleep(150);

      // Should be expired
      expect(await stateStore.get(key)).toBeNull();
    });

    it('should handle different TTL values correctly', async () => {
      const shortKey = 'short-ttl';
      const longKey = 'long-ttl';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await stateStore.set(shortKey, value, 50); // 50ms
      await stateStore.set(longKey, value, 5000); // 5s

      // Both available initially
      expect(await stateStore.get(shortKey)).toEqual(value);
      expect(await stateStore.get(longKey)).toEqual(value);

      // Wait for short TTL to expire
      await sleep(100);

      // Short should be expired, long should remain
      expect(await stateStore.get(shortKey)).toBeNull();
      expect(await stateStore.get(longKey)).toEqual(value);
    });

    it('should handle zero and negative TTL correctly', async () => {
      const key = 'zero-ttl';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      // Zero TTL should expire immediately
      await stateStore.set(key, value, 0);
      await sleep(10); // Small delay to allow for processing
      expect(await stateStore.get(key)).toBeNull();
    });
  });

  describe('Consume-Once Semantics', () => {
    it('should consume values only once', async () => {
      const key = 'consume-test';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID, token: 'secret' };

      await stateStore.set(key, value, 5000);

      // First consume should work
      const first = await stateStore.consume(key);
      expect(first).toEqual(value);

      // Second consume should return null
      const second = await stateStore.consume(key);
      expect(second).toBeNull();

      // Regular get should also return null after consumption
      const retrieved = await stateStore.get(key);
      expect(retrieved).toBeNull();
    });

    it('should not affect regular get operations before consumption', async () => {
      const key = 'get-before-consume';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await stateStore.set(key, value, 5000);

      // Multiple gets should work
      expect(await stateStore.get(key)).toEqual(value);
      expect(await stateStore.get(key)).toEqual(value);

      // Consume should still work
      expect(await stateStore.consume(key)).toEqual(value);

      // Now nothing should work
      expect(await stateStore.get(key)).toBeNull();
      expect(await stateStore.consume(key)).toBeNull();
    });

    it('should handle consume on expired records', async () => {
      const key = 'expire-before-consume';
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      await stateStore.set(key, value, 50); // 50ms TTL

      // Wait for expiration
      await sleep(100);

      // Consume should return null for expired record
      const result = await stateStore.consume(key);
      expect(result).toBeNull();
    });

    it('should handle consume on non-existent records', async () => {
      const result = await stateStore.consume('non-existent-key');
      expect(result).toBeNull();
    });
  });

  describe('Memory Management', () => {
    it('should automatically clean up expired records', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      // Set records with short TTL
      for (const key of keys) {
        await stateStore.set(key, value, 50); // 50ms TTL
      }

      // All should be available initially
      for (const key of keys) {
        expect(await stateStore.get(key)).toEqual(value);
      }

      // Wait for expiration and cleanup
      await sleep(150);

      // All should be cleaned up
      for (const key of keys) {
        expect(await stateStore.get(key)).toBeNull();
      }
    });

    it('should handle mixed TTL cleanup correctly', async () => {
      const shortKeys = ['short1', 'short2'];
      const longKeys = ['long1', 'long2'];
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      // Set some with short TTL, some with long TTL
      for (const key of shortKeys) {
        await stateStore.set(key, value, 50); // 50ms
      }
      for (const key of longKeys) {
        await stateStore.set(key, value, 5000); // 5s
      }

      // Wait for short TTL to expire
      await sleep(100);

      // Short keys should be cleaned up
      for (const key of shortKeys) {
        expect(await stateStore.get(key)).toBeNull();
      }

      // Long keys should remain
      for (const key of longKeys) {
        expect(await stateStore.get(key)).toEqual(value);
      }
    });

    it('should handle high volume of concurrent operations', async () => {
      const operations = [];
      const numOps = 100;

      // Create many concurrent set/get operations
      for (let i = 0; i < numOps; i++) {
        const key = `concurrent-${i}`;
        const value = { discordId: TEST_USERS.VALID_DISCORD_ID, index: i };
        
        operations.push(
          stateStore.set(key, value, 1000).then(() => 
            stateStore.get(key)
          )
        );
      }

      const results = await Promise.all(operations);

      // All operations should succeed
      results.forEach((result, index) => {
        expect(result).toEqual({ 
          discordId: TEST_USERS.VALID_DISCORD_ID, 
          index 
        });
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle null and undefined values', async () => {
      await stateStore.set('null-value', null, 5000);
      await stateStore.set('undefined-value', undefined, 5000);

      expect(await stateStore.get('null-value')).toBeNull();
      expect(await stateStore.get('undefined-value')).toBeUndefined();
    });

    it('should handle complex nested objects', async () => {
      const complexValue = {
        discordId: TEST_USERS.VALID_DISCORD_ID,
        nested: {
          array: [1, 2, 3],
          object: { 
            deep: { 
              value: 'test',
              boolean: true,
              number: 42
            }
          }
        },
        metadata: {
          timestamp: Date.now(),
          version: '1.0.0'
        }
      };

      await stateStore.set('complex-object', complexValue, 5000);
      const retrieved = await stateStore.get('complex-object');

      expect(retrieved).toEqual(complexValue);
    });

    it('should handle empty strings and objects', async () => {
      await stateStore.set('empty-string', '', 5000);
      await stateStore.set('empty-object', {}, 5000);
      await stateStore.set('empty-array', [], 5000);

      expect(await stateStore.get('empty-string')).toBe('');
      expect(await stateStore.get('empty-object')).toEqual({});
      expect(await stateStore.get('empty-array')).toEqual([]);
    });

    it('should handle special characters in keys', async () => {
      const specialKeys = [
        'key-with-dashes',
        'key_with_underscores',
        'key.with.dots',
        'key:with:colons',
        'key/with/slashes'
      ];
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      for (const key of specialKeys) {
        await stateStore.set(key, value, 5000);
        expect(await stateStore.get(key)).toEqual(value);
      }
    });

    it('should maintain isolation between different keys', async () => {
      const userA = { discordId: 'user-a', data: 'secret-a' };
      const userB = { discordId: 'user-b', data: 'secret-b' };

      await stateStore.set('session-a', userA, 5000);
      await stateStore.set('session-b', userB, 5000);

      // Each user should only see their own data
      expect(await stateStore.get('session-a')).toEqual(userA);
      expect(await stateStore.get('session-b')).toEqual(userB);

      // Consuming one shouldn't affect the other
      await stateStore.consume('session-a');
      expect(await stateStore.get('session-a')).toBeNull();
      expect(await stateStore.get('session-b')).toEqual(userB);
    });
  });

  describe('Performance', () => {
    it('should handle rapid successive operations', async () => {
      const key = 'rapid-ops';
      const iterations = 50;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        await stateStore.set(key, { iteration: i }, 5000);
        const retrieved = await stateStore.get(key);
        expect(retrieved.iteration).toBe(i);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second for 50 iterations
    });

    it('should handle memory cleanup efficiently', async () => {
      const numRecords = 1000;
      const value = { discordId: TEST_USERS.VALID_DISCORD_ID };

      // Create many short-lived records
      const promises = [];
      for (let i = 0; i < numRecords; i++) {
        promises.push(stateStore.set(`temp-${i}`, value, 50)); // 50ms TTL
      }
      await Promise.all(promises);

      // Wait for cleanup
      await sleep(200);

      // All should be cleaned up
      for (let i = 0; i < numRecords; i++) {
        expect(await stateStore.get(`temp-${i}`)).toBeNull();
      }
    });
  });
});