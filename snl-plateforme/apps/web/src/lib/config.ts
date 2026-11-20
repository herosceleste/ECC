import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** Adresse publique de l'interface (sert d'adresse de retour après connexion). */
  URL_PUBLIQUE_WEB: z.url().default('http://localhost:3000'),
  /** Adresse de l'API vue depuis le serveur Next. */
  API_URL: z.url().default('http://localhost:3001'),
  /** Émetteur OIDC tel que le voit le navigateur. */
  OIDC_ISSUER: z.url(),
  /** Émetteur OIDC tel que le voit le serveur Next, s'il diffère (réseau Docker). */
  OIDC_ISSUER_INTERNE: z.url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).default('snl-web'),
  /** 32 octets aléatoires encodés en base64 : chiffrent le cookie de session. */
  SECRET_SESSION: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, {
    message: 'doit contenir 32 octets encodés en base64',
  }),
});

export type ConfigWeb = z.infer<typeof schema>;

let enCache: ConfigWeb | undefined;

export function config(): ConfigWeb {
  if (enCache) return enCache;
  const resultat = schema.safeParse(process.env);
  if (!resultat.success) {
    const details = resultat.error.issues.map((i) => `${i.path.join('.')} : ${i.message}`).join(' ; ');
    throw new Error(`Configuration de l'interface invalide : ${details}`);
  }
  enCache = resultat.data;
  return enCache;
}

export function urlsOidc(c: ConfigWeb = config()) {
  const publique = c.OIDC_ISSUER.replace(/\/$/, '');
  const interne = (c.OIDC_ISSUER_INTERNE ?? c.OIDC_ISSUER).replace(/\/$/, '');
  return {
    autorisation: `${publique}/protocol/openid-connect/auth`,
    deconnexion: `${publique}/protocol/openid-connect/logout`,
    jeton: `${interne}/protocol/openid-connect/token`,
    revocation: `${interne}/protocol/openid-connect/revoke`,
  };
}
