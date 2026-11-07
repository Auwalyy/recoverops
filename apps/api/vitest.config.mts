import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@recoveros/shared': path.resolve(import.meta.dirname, '../../packages/shared/src/index.ts') },
  },
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.ts'],
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: true,
    env: {
      NODE_ENV: 'test',
      QUEUE_DRIVER: 'inline',
      JWT_ACCESS_SECRET: 'test-access-secret-0123456789-abcdefghijklmnop',
      JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789-abcdefghijklmno',
      STORAGE_DRIVER: 'local',
      STORAGE_LOCAL_DIR: './.storage-test',
      LOG_LEVEL: 'silent',
      ENABLE_SWAGGER: 'true',
      DEV_EXPOSE_OTP: 'true',
      GEMINI_API_KEY: '',
    },
  },
});
