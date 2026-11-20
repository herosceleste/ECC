import { config, urlsOidc } from './config';
import type { Session } from './session';

/**
 * Flux « authorization code » avec PKCE, conduit par le serveur Next.
 * Le client Keycloak « snl-web » est public : PKCE remplace le secret.
 */

function base64Url(octets: Uint8Array): string {
  return Buffer.from(octets).toString('base64url');
}

export function aleatoire(taille = 32): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(taille)));
}

export async function defiPkce(verificateur: string): Promise<string> {
  const empreinte = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verificateur));
  return base64Url(new Uint8Array(empreinte));
}

export function urlRetourOidc(): string {
  return `${config().URL_PUBLIQUE_WEB.replace(/\/$/, '')}/auth/rappel`;
}

export async function urlAutorisation(etat: string, verificateur: string): Promise<string> {
  const c = config();
  const parametres = new URLSearchParams({
    client_id: c.OIDC_CLIENT_ID,
    response_type: 'code',
    scope: 'openid profile email',
    redirect_uri: urlRetourOidc(),
    state: etat,
    code_challenge: await defiPkce(verificateur),
    code_challenge_method: 'S256',
    ui_locales: 'fr',
  });
  return `${urlsOidc(c).autorisation}?${parametres}`;
}

interface ReponseJetons {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function demanderJetons(corps: Record<string, string>): Promise<Session> {
  const reponse = await fetch(urlsOidc().jeton, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config().OIDC_CLIENT_ID, ...corps }),
    cache: 'no-store',
  });
  if (!reponse.ok) throw new Error(`Échange de jetons refusé (${reponse.status}).`);
  const jetons = (await reponse.json()) as ReponseJetons;
  return {
    jetonAcces: jetons.access_token,
    jetonRafraichissement: jetons.refresh_token,
    expireA: Date.now() + jetons.expires_in * 1000,
  };
}

export function echangerCode(code: string, verificateur: string): Promise<Session> {
  return demanderJetons({
    grant_type: 'authorization_code',
    code,
    redirect_uri: urlRetourOidc(),
    code_verifier: verificateur,
  });
}

export async function rafraichir(session: Session): Promise<Session> {
  if (!session.jetonRafraichissement) throw new Error('Pas de jeton de rafraîchissement.');
  const nouvelle = await demanderJetons({
    grant_type: 'refresh_token',
    refresh_token: session.jetonRafraichissement,
  });
  return {
    ...nouvelle,
    jetonRafraichissement: nouvelle.jetonRafraichissement ?? session.jetonRafraichissement,
    associationId: session.associationId,
  };
}

/** Révoque la session côté Keycloak ; un échec n'empêche pas la déconnexion locale. */
export async function revoquer(session: Session): Promise<void> {
  if (!session.jetonRafraichissement) return;
  await fetch(urlsOidc().revocation, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config().OIDC_CLIENT_ID,
      token: session.jetonRafraichissement,
      token_type_hint: 'refresh_token',
    }),
    cache: 'no-store',
  }).catch(() => undefined);
}

export function urlDeconnexionKeycloak(): string {
  const c = config();
  const parametres = new URLSearchParams({
    client_id: c.OIDC_CLIENT_ID,
    post_logout_redirect_uri: `${c.URL_PUBLIQUE_WEB.replace(/\/$/, '')}/connexion?deconnecte=1`,
  });
  return `${urlsOidc(c).deconnexion}?${parametres}`;
}
