import { Inject, Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { CONFIGURATION, type Configuration } from '../config/configuration';

export interface JetonVerifie {
  sujet: string;
  email: string;
  nom: string;
  acr?: string;
}

/** Abstraction remplaçable dans les tests. */
export abstract class VerificateurJeton {
  abstract verifier(jeton: string): Promise<JetonVerifie>;
}

/**
 * Vérifie les jetons d'accès émis par Keycloak (signature par les clés
 * publiques du royaume, émetteur, audience, expiration).
 */
@Injectable()
export class VerificateurJetonOidc extends VerificateurJeton {
  private readonly cles: ReturnType<typeof createRemoteJWKSet>;

  constructor(@Inject(CONFIGURATION) private readonly config: Configuration) {
    super();
    const jwksUrl = new URL(
      config.OIDC_JWKS_URL ?? `${config.OIDC_ISSUER.replace(/\/$/, '')}/protocol/openid-connect/certs`,
    );
    this.cles = createRemoteJWKSet(jwksUrl, { cooldownDuration: 30_000 });
  }

  async verifier(jeton: string): Promise<JetonVerifie> {
    const { payload } = await jwtVerify(jeton, this.cles, {
      issuer: this.config.OIDC_ISSUER,
      audience: this.config.OIDC_AUDIENCE,
      algorithms: ['RS256', 'ES256'],
    });
    return extraireIdentite(payload);
  }
}

export function extraireIdentite(payload: JWTPayload): JetonVerifie {
  const email = typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined;
  if (!payload.sub || !email) {
    throw new Error('Jeton sans sujet ou sans adresse électronique.');
  }
  const nom =
    typeof payload.name === 'string' && payload.name.trim() !== '' ? payload.name : email;
  const acr = typeof payload.acr === 'string' ? payload.acr : undefined;
  return { sujet: payload.sub, email, nom, acr };
}
