import { z } from 'zod';

/**
 * Configuration lue dans l'environnement et validée au démarrage : une valeur
 * manquante ou invalide arrête l'API avec un message explicite, plutôt que de
 * la laisser démarrer dans un état incertain.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),

  OIDC_ISSUER: z.string().url(),
  OIDC_AUDIENCE: z.string().min(1),
  /** URL des clés publiques, si l'API ne joint pas Keycloak par l'adresse de l'émetteur. */
  OIDC_JWKS_URL: z.string().url().optional(),
  /** Valeurs du claim `acr` attestant un second facteur (exigence T-03). */
  OIDC_ACR_SECOND_FACTEUR: z
    .string()
    .default('mfa')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  EXIGER_SECOND_FACTEUR: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  KEYCLOAK_ADMIN_URL: z.string().url().optional(),
  KEYCLOAK_REALM: z.string().default('snl'),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().optional(),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().optional(),
  URL_PUBLIQUE_WEB: z.string().url().default('http://localhost:3000'),

  S3_ENDPOINT: z.string().url(),
  /** Adresse du stockage vue par le navigateur, pour signer les liens de téléchargement. */
  S3_ENDPOINT_PUBLIC: z.string().url().optional(),
  S3_REGION: z.string().default('fr-par'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  DUREE_LIEN_DOCUMENT_SECONDES: z.coerce.number().int().min(30).max(900).default(300),
  TAILLE_MAX_DOCUMENT_OCTETS: z.coerce.number().int().positive().default(15 * 1024 * 1024),

  CLAMAV_HOTE: z.string().default('clamav'),
  CLAMAV_PORT: z.coerce.number().int().positive().default(3310),

  /** Clé AES-256 (32 octets encodés en base64) des données sensibles. */
  CLE_CHIFFREMENT_DONNEES: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, {
      message: 'doit contenir 32 octets encodés en base64',
    }),

  /** Envoi des courriels ; sans SMTP_HOTE, les notifications sont seulement journalisées. */
  SMTP_HOTE: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_TLS_IMPLICITE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  SMTP_UTILISATEUR: z.string().optional(),
  SMTP_MOT_DE_PASSE: z.string().optional(),
  EXPEDITEUR_COURRIEL: z.string().default('Plateforme SNL <ne-pas-repondre@snl.localhost>'),

  CORS_ORIGINES: z
    .string()
    .default('http://localhost:3000')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
});

export type Configuration = z.infer<typeof schema>;

export function chargerConfiguration(env: NodeJS.ProcessEnv = process.env): Configuration {
  const resultat = schema.safeParse(env);
  if (!resultat.success) {
    const details = resultat.error.issues
      .map((i) => `  - ${i.path.join('.')} : ${i.message}`)
      .join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return resultat.data;
}

export const CONFIGURATION = Symbol('CONFIGURATION');
