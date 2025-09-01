import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    timeout: 30000,
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 30000,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['apps/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.d.ts', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@orchestrator': path.resolve(__dirname, '../apps/orchestrator/src'),
      '@discord-bot': path.resolve(__dirname, '../apps/discord-bot/src'),
      '@tests': path.resolve(__dirname, './'),
    },
  },
});