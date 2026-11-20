import { NextResponse, type NextRequest } from 'next/server';
import { config as configWeb } from './lib/config';
import { rafraichir } from './lib/oidc';
import { ecrireSession, effacerSession, lireSession, type MagasinCookies } from './lib/session';

/** Pages accessibles sans session. */
const PUBLIQUES = ['/connexion', '/auth/'];
/** Marge avant expiration du jeton d'accès à partir de laquelle on le renouvelle. */
const MARGE_RAFRAICHISSEMENT_MS = 60_000;

/**
 * Politique de sécurité du contenu : seuls les scripts portant le nonce de
 * la requête s'exécutent, ce qui neutralise l'essentiel des injections.
 */
function politiqueContenu(nonce: string, emetteur: string, dev: boolean): string {
  const origineIdentite = new URL(emetteur).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? ' ws:' : ''}`,
    `form-action 'self' ${origineIdentite}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ');
}

export async function middleware(requete: NextRequest) {
  const c = configWeb();
  const securise = c.URL_PUBLIQUE_WEB.startsWith('https://');
  const nonce = Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
  const csp = politiqueContenu(nonce, c.OIDC_ISSUER, c.NODE_ENV === 'development');

  const enTetesRequete = new Headers(requete.headers);
  enTetesRequete.set('x-nonce', nonce);
  enTetesRequete.set('Content-Security-Policy', csp);

  const chemin = requete.nextUrl.pathname;
  const publique = PUBLIQUES.some((p) => chemin === p || chemin.startsWith(p));
  const session = publique ? null : await lireSession(requete.cookies, c.SECRET_SESSION);

  const versConnexion = () => {
    // Adresse publique, jamais requete.url : derrière un proxy, celle-ci est interne.
    const url = new URL('/connexion', c.URL_PUBLIQUE_WEB);
    if (chemin !== '/') url.searchParams.set('retour', chemin + requete.nextUrl.search);
    const reponse = NextResponse.redirect(url);
    effacerSession(reponse.cookies as unknown as MagasinCookies);
    return reponse;
  };

  if (!publique && !session) return versConnexion();

  let sessionAJour = session;
  if (session && session.expireA - Date.now() < MARGE_RAFRAICHISSEMENT_MS) {
    try {
      sessionAJour = await rafraichir(session);
    } catch {
      return versConnexion();
    }
    // Le cookie renouvelé est transmis à la page en cours de rendu, puis au navigateur.
    const magasinRequete = requete.cookies as unknown as MagasinCookies;
    await ecrireSession(magasinRequete, sessionAJour, c.SECRET_SESSION, securise);
    enTetesRequete.set('cookie', requete.cookies.toString());
  }

  const reponse = NextResponse.next({ request: { headers: enTetesRequete } });
  reponse.headers.set('Content-Security-Policy', csp);
  if (sessionAJour && sessionAJour !== session) {
    await ecrireSession(reponse.cookies as unknown as MagasinCookies, sessionAJour, c.SECRET_SESSION, securise);
  }
  return reponse;
}

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt).*)'],
};
