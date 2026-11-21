import { defineConfig } from '@playwright/test';

/**
 * Recette d'une installation qui tourne déjà (docker compose up) : aucun serveur
 * n'est démarré ici. Voir test/recette/installation.spec.ts.
 */
export default defineConfig({
  testDir: 'test/recette',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: { baseURL: process.env.URL_WEB ?? 'http://localhost:3000', locale: 'fr-FR', trace: 'off' },
});
