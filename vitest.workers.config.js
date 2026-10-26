import path from 'node:path';
import { defineWorkersConfig, readD1Migrations } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    test: {
      include: ['tests/worker/**/*.test.js'],
      setupFiles: ['tests/worker/apply-migrations.js'],
      poolOptions: {
        workers: {
          singleWorker: true,
          isolatedStorage: true,
          miniflare: {
            compatibilityDate: '2026-03-01',
            d1Databases: ['DB'],
            bindings: {
              TEST_MIGRATIONS: migrations,
              GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com',
              GOOGLE_CLIENT_SECRET: 'test-secret',
              COOKIE_SECRET: 'test-cookie-secret',
              SUPER_ADMIN_EMAILS: 'root@nexus.test',
            },
          },
        },
      },
    },
  };
});
