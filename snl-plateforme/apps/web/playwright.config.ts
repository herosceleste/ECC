import { defineConfig } from '@playwright/test';
import { randomBytes } from 'node:crypto';

/**
 * Tests de bout en bout : interface (Next.js) + API + PostgreSQL réels, et un
 * faux fournisseur d'identité qui signe de vrais jetons.
 *
 * Prérequis : une base migrée et l'API construite (apps/api/dist), puis :
 *   DATABASE_URL_PROPRIETAIRE=… DATABASE_URL_APPLICATION=… npm run test:e2e
 */
const proprietaire = process.env.DATABASE_URL_PROPRIETAIRE;
const application = process.env.DATABASE_URL_APPLICATION;
if (!proprietaire || !application) {
  throw new Error('Définissez DATABASE_URL_PROPRIETAIRE et DATABASE_URL_APPLICATION pour les tests de bout en bout.');
}

// « localhost » et non 127.0.0.1 : Next.js réécrit les adresses de bouclage en « localhost ».
const WEB = 'http://localhost:3100';
const API = 'http://127.0.0.1:3101';
const OIDC = 'http://127.0.0.1:8099/realms/snl';

export default defineConfig({
  testDir: 'test/e2e',
  globalSetup: './test/e2e/preparation.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: WEB, locale: 'fr-FR', trace: 'off' },
  webServer: [
    {
      command: 'node test/e2e/fournisseur-oidc.mjs',
      url: `${OIDC}/protocol/openid-connect/certs`,
      reuseExistingServer: false,
    },
    {
      command: 'node ../api/dist/main.js',
      url: `${API}/sante`,
      reuseExistingServer: false,
      env: {
        NODE_ENV: 'test',
        PORT: '3101',
        DATABASE_URL: application,
        OIDC_ISSUER: OIDC,
        OIDC_AUDIENCE: 'snl-api',
        S3_ENDPOINT: 'http://127.0.0.1:9',
        S3_BUCKET: 'documents',
        S3_ACCESS_KEY: 'test',
        S3_SECRET_KEY: 'test',
        CLAMAV_HOTE: '127.0.0.1',
        CLAMAV_PORT: '9',
        CLE_CHIFFREMENT_DONNEES: randomBytes(32).toString('base64'),
        CORS_ORIGINES: WEB,
      },
    },
    {
      command: 'npx next start -p 3100',
      url: `${WEB}/connexion`,
      reuseExistingServer: false,
      env: {
        URL_PUBLIQUE_WEB: WEB,
        API_URL: API,
        OIDC_ISSUER: OIDC,
        SECRET_SESSION: randomBytes(32).toString('base64'),
      },
    },
  ],
});
