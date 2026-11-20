import { randomBytes } from 'node:crypto';
import { chargerConfiguration } from '../../src/config/configuration';

const minimale = {
  DATABASE_URL: 'postgresql://snl_app:x@localhost:5432/snl',
  OIDC_ISSUER: 'http://localhost:8080/realms/snl',
  OIDC_AUDIENCE: 'snl-api',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'documents',
  S3_ACCESS_KEY: 'a',
  S3_SECRET_KEY: 'b',
  CLE_CHIFFREMENT_DONNEES: randomBytes(32).toString('base64'),
};

describe('chargerConfiguration', () => {
  it('applique des valeurs par défaut prudentes', () => {
    const config = chargerConfiguration(minimale);
    expect(config.EXIGER_SECOND_FACTEUR).toBe(true);
    expect(config.DUREE_LIEN_DOCUMENT_SECONDES).toBe(300);
    expect(config.OIDC_ACR_SECOND_FACTEUR).toEqual(['mfa']);
  });

  it('refuse de démarrer avec une clé de chiffrement invalide, en le disant clairement', () => {
    expect(() => chargerConfiguration({ ...minimale, CLE_CHIFFREMENT_DONNEES: 'courte' })).toThrow(
      /CLE_CHIFFREMENT_DONNEES : doit contenir 32 octets/,
    );
  });

  it('signale toutes les variables manquantes', () => {
    expect(() => chargerConfiguration({})).toThrow(/DATABASE_URL[\s\S]*OIDC_ISSUER/);
  });
});
