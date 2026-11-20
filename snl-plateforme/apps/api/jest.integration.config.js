/**
 * Tests d'intégration contre un vrai PostgreSQL (isolation RLS, parcours HTTP).
 * Ils exigent DATABASE_URL_PROPRIETAIRE et DATABASE_URL ; sans elles, ils sont ignorés.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testMatch: ['**/*.spec.ts'],
  transform: { '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }] },
  moduleNameMapper: { '^@snl/shared$': '<rootDir>/../../packages/shared/src' },
  testTimeout: 30000,
};
