import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: { include: ['test/unit/**/*.spec.ts'], environment: 'node' },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@snl/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
      'server-only': fileURLToPath(new URL('./test/unit/vide.ts', import.meta.url)),
    },
  },
});
