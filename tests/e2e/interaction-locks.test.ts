import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { interactionLock } from '../../apps/discord-bot/src/services/lock';
import { handleInteraction } from '../../apps/discord-bot/src/handlers/interactions';
import { 
  createMockChatInputCommandInteraction,
  createMockUser 
} from '../mocks/discord.mock';
import { sleep, waitFor } from '../utils/test-helpers';
import { TEST_USERS } from '../setup';

// Mock the command handlers to avoid actual command execution
vi.mock('../../apps/discord-bot/src/commands/auth', () => ({
  authCommand: {
    data: { name: 'auth' },
    execute: vi.fn().mockResolvedValue(undefined)
  }
}));

describe('Interaction Locks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up any remaining locks
    await interactionLock.cleanAll?.() ?? Promise.resolve();
  });

  describe('Basic Lock Operations', () => {
    it('should acquire lock for new interaction', async () => {
      const lockAcquired = await interactionLock.acquire('test-interaction-1');
      expect(lockAcquired).toBe(true);
    });

    it('should prevent duplicate lock acquisition', async () => {
      const interactionId = 'duplicate-test';
      
      const first = await interactionLock.acquire(interactionId);
      expect(first).toBe(true);
      
      const second = await interactionLock.acquire(interactionId);
      expect(second).toBe(false);
    });

    it('should release lock when explicitly called', async () => {
      const interactionId = 'release-test';
      
      await interactionLock.acquire(interactionId);
      await interactionLock.release(interactionId);
      
      // Should be able to acquire again after release
      const reacquired = await interactionLock.acquire(interactionId);
      expect(reacquired).toBe(true);
    });

    it('should auto-expire locks after TTL', async () => {
      const interactionId = 'ttl-test';
      const shortTTL = 100; // 100ms
      
      const acquired = await interactionLock.acquire(interactionId, shortTTL);
      expect(acquired).toBe(true);
      
      // Should still be locked immediately
      const blocked = await interactionLock.acquire(interactionId);
      expect(blocked).toBe(false);
      
      // Wait for expiration
      await sleep(150);
      
      // Should be available after expiration
      const reacquired = await interactionLock.acquire(interactionId);
      expect(reacquired).toBe(true);
    });
  });

  describe('Interaction Handler Integration', () => {
    let mockClient: any;
    let mockInteraction: any;

    beforeEach(() => {
      mockClient = {
        commands: new Map([
          ['auth', {
            data: { name: 'auth' },
            execute: vi.fn().mockResolvedValue(undefined)
          }]
        ])
      };
      
      mockInteraction = createMockChatInputCommandInteraction({
        id: 'test-interaction-123',
        commandName: 'auth',
        user: createMockUser({ id: TEST_USERS.VALID_DISCORD_ID })
      });
    });

    it('should acquire lock before handling interaction', async () => {
      const lockSpy = vi.spyOn(interactionLock, 'acquire');
      
      await handleInteraction(mockClient, mockInteraction);
      
      expect(lockSpy).toHaveBeenCalledWith('test-interaction-123');
    });

    it('should release lock after handling interaction', async () => {
      const releaseSpy = vi.spyOn(interactionLock, 'release');
      
      await handleInteraction(mockClient, mockInteraction);
      
      expect(releaseSpy).toHaveBeenCalledWith('test-interaction-123');
    });

    it('should drop duplicate interactions', async () => {
      const commandSpy = vi.spyOn(mockClient.commands.get('auth'), 'execute');
      
      // Start first interaction (don't await to simulate concurrency)
      const firstHandle = handleInteraction(mockClient, mockInteraction);
      
      // Start second interaction with same ID immediately
      const secondHandle = handleInteraction(mockClient, mockInteraction);
      
      // Wait for both to complete
      await Promise.all([firstHandle, secondHandle]);
      
      // Command should only be executed once
      expect(commandSpy).toHaveBeenCalledTimes(1);
    });

    it('should release lock even when command fails', async () => {
      const commandExecute = mockClient.commands.get('auth').execute;
      commandExecute.mockRejectedValue(new Error('Command failed'));
      
      const releaseSpy = vi.spyOn(interactionLock, 'release');
      
      // Should not throw due to error handling
      await handleInteraction(mockClient, mockInteraction);
      
      expect(releaseSpy).toHaveBeenCalledWith('test-interaction-123');
    });

    it('should handle multiple different interactions concurrently', async () => {
      const interaction1 = { ...mockInteraction, id: 'interaction-1' };
      const interaction2 = { ...mockInteraction, id: 'interaction-2' };
      
      const commandSpy = vi.spyOn(mockClient.commands.get('auth'), 'execute');
      
      // Both should be able to run concurrently with different IDs
      await Promise.all([
        handleInteraction(mockClient, interaction1),
        handleInteraction(mockClient, interaction2)
      ]);
      
      expect(commandSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe('Multi-Instance Simulation', () => {
    it('should prevent race conditions between instances', async () => {
      const interactionId = 'race-condition-test';
      let executionCount = 0;
      
      // Simulate multiple bot instances trying to handle the same interaction
      const simulateInstance = async (instanceId: number) => {
        const acquired = await interactionLock.acquire(interactionId);
        if (acquired) {
          // Simulate work being done
          executionCount++;
          await sleep(10);
          await interactionLock.release(interactionId);
          return instanceId;
        }
        return null;
      };
      
      // Start 5 concurrent "instances"
      const instances = Array.from({ length: 5 }, (_, i) => simulateInstance(i));
      const results = await Promise.all(instances);
      
      // Only one instance should have succeeded
      const successful = results.filter(r => r !== null);
      expect(successful).toHaveLength(1);
      expect(executionCount).toBe(1);
    });

    it('should handle high concurrency load', async () => {
      const numConcurrentRequests = 100;
      const results = await Promise.all(
        Array.from({ length: numConcurrentRequests }, async (_, i) => {
          const interactionId = `concurrent-${i}`;
          return await interactionLock.acquire(interactionId);
        })
      );
      
      // All unique interactions should succeed
      expect(results.every(r => r === true)).toBe(true);
    });

    it('should maintain lock isolation between different interactions', async () => {
      const interactions = ['int-1', 'int-2', 'int-3', 'int-4', 'int-5'];
      
      // Acquire locks for all interactions
      const acquisitions = await Promise.all(
        interactions.map(id => interactionLock.acquire(id))
      );
      
      // All should succeed (different interaction IDs)
      expect(acquisitions.every(a => a === true)).toBe(true);
      
      // Release all locks
      await Promise.all(
        interactions.map(id => interactionLock.release(id))
      );
      
      // All should be reacquirable
      const reacquisitions = await Promise.all(
        interactions.map(id => interactionLock.acquire(id))
      );
      
      expect(reacquisitions.every(a => a === true)).toBe(true);
    });
  });

  describe('Memory Management', () => {
    it('should automatically clean up expired locks', async () => {
      const lockIds = ['cleanup-1', 'cleanup-2', 'cleanup-3'];
      const shortTTL = 50; // 50ms
      
      // Acquire locks with short TTL
      for (const id of lockIds) {
        await interactionLock.acquire(id, shortTTL);
      }
      
      // All should be locked initially
      for (const id of lockIds) {
        expect(await interactionLock.acquire(id)).toBe(false);
      }
      
      // Wait for cleanup
      await sleep(100);
      
      // All should be cleaned up and reacquirable
      for (const id of lockIds) {
        expect(await interactionLock.acquire(id)).toBe(true);
      }
    });

    it('should handle mixed TTL cleanup correctly', async () => {
      const shortIds = ['short-1', 'short-2'];
      const longIds = ['long-1', 'long-2'];
      
      // Acquire with different TTLs
      for (const id of shortIds) {
        await interactionLock.acquire(id, 50); // 50ms
      }
      for (const id of longIds) {
        await interactionLock.acquire(id, 5000); // 5s
      }
      
      // Wait for short TTL to expire
      await sleep(100);
      
      // Short TTL locks should be cleaned up
      for (const id of shortIds) {
        expect(await interactionLock.acquire(id)).toBe(true);
      }
      
      // Long TTL locks should still be held
      for (const id of longIds) {
        expect(await interactionLock.acquire(id)).toBe(false);
      }
    });

    it('should prevent memory leaks with many short-lived locks', async () => {
      const numLocks = 1000;
      const promises = [];
      
      // Create many short-lived locks
      for (let i = 0; i < numLocks; i++) {
        promises.push(
          interactionLock.acquire(`temp-${i}`, 10).then(async (acquired) => {
            if (acquired) {
              await sleep(5);
              await interactionLock.release(`temp-${i}`);
            }
          })
        );
      }
      
      await Promise.all(promises);
      
      // Wait for any remaining cleanup
      await sleep(50);
      
      // Memory usage should be reasonable (locks should be cleaned up)
      // This is more of a conceptual test - in a real environment you'd monitor memory
    });
  });

  describe('Edge Cases', () => {
    it('should handle releasing non-existent locks gracefully', async () => {
      // Should not throw when releasing a lock that doesn't exist
      await expect(interactionLock.release('non-existent')).resolves.not.toThrow();
    });

    it('should handle acquiring with zero TTL', async () => {
      const acquired = await interactionLock.acquire('zero-ttl', 0);
      expect(acquired).toBe(true);
      
      // Should expire immediately
      await sleep(10);
      const reacquired = await interactionLock.acquire('zero-ttl');
      expect(reacquired).toBe(true);
    });

    it('should handle negative TTL gracefully', async () => {
      const acquired = await interactionLock.acquire('negative-ttl', -1000);
      expect(acquired).toBe(true);
      
      // Should be immediately expired
      const reacquired = await interactionLock.acquire('negative-ttl');
      expect(reacquired).toBe(true);
    });

    it('should handle very large TTL values', async () => {
      const hugeTTL = Number.MAX_SAFE_INTEGER;
      const acquired = await interactionLock.acquire('huge-ttl', hugeTTL);
      expect(acquired).toBe(true);
      
      // Should still be locked
      const blocked = await interactionLock.acquire('huge-ttl');
      expect(blocked).toBe(false);
    });

    it('should handle special characters in lock keys', async () => {
      const specialKeys = [
        'lock-with-dashes',
        'lock_with_underscores',
        'lock.with.dots',
        'lock:with:colons',
        'lock/with/slashes',
        'lock with spaces',
        'lock🔐with🔑emoji'
      ];
      
      for (const key of specialKeys) {
        const acquired = await interactionLock.acquire(key);
        expect(acquired).toBe(true);
        
        // Should prevent duplicate acquisition
        const duplicate = await interactionLock.acquire(key);
        expect(duplicate).toBe(false);
        
        await interactionLock.release(key);
      }
    });

    it('should handle concurrent acquire and release operations', async () => {
      const lockId = 'concurrent-ops';
      const operations = [];
      
      // Mix of acquire and release operations
      for (let i = 0; i < 50; i++) {
        if (i % 2 === 0) {
          operations.push(interactionLock.acquire(lockId));
        } else {
          operations.push(interactionLock.release(lockId));
        }
      }
      
      // All operations should complete without throwing
      const results = await Promise.allSettled(operations);
      
      // No operations should have been rejected
      const rejected = results.filter(r => r.status === 'rejected');
      expect(rejected).toHaveLength(0);
    });
  });

  describe('Performance', () => {
    it('should handle rapid lock acquisition and release cycles', async () => {
      const lockId = 'rapid-cycle';
      const cycles = 100;
      
      const startTime = Date.now();
      
      for (let i = 0; i < cycles; i++) {
        const acquired = await interactionLock.acquire(lockId);
        expect(acquired).toBe(true);
        await interactionLock.release(lockId);
      }
      
      const duration = Date.now() - startTime;
      
      // Should complete cycles quickly (adjust threshold as needed)
      expect(duration).toBeLessThan(1000); // 1 second for 100 cycles
    });

    it('should maintain consistent performance under load', async () => {
      const numOperations = 500;
      const startTime = Date.now();
      
      const operations = Array.from({ length: numOperations }, async (_, i) => {
        const lockId = `load-test-${i % 10}`; // Reuse 10 different lock IDs
        const acquired = await interactionLock.acquire(lockId, 10);
        if (acquired) {
          await sleep(1);
          await interactionLock.release(lockId);
        }
      });
      
      await Promise.all(operations);
      
      const duration = Date.now() - startTime;
      
      // Should handle load efficiently
      expect(duration).toBeLessThan(2000); // 2 seconds for 500 operations
    });
  });
});