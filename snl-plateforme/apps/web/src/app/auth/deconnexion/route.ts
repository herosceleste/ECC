import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { config } from '@/lib/config';
import { revoquer, urlDeconnexionKeycloak } from '@/lib/oidc';
import { effacerSession, lireSession } from '@/lib/session';

/**
 * Déconnexion (formulaire POST, protégé par l'en-tête Origin) : révocation
 * du jeton, effacement du cookie, puis fin de la session Keycloak.
 */
export async function POST(requete: Request) {
  const c = config();
  const origine = requete.headers.get('origin');
  if (origine && origine !== new URL(c.URL_PUBLIQUE_WEB).origin) {
    return new NextResponse('Origine refusée', { status: 403 });
  }
  const magasin = await cookies();
  const session = await lireSession(magasin, c.SECRET_SESSION);
  if (session) await revoquer(session);
  effacerSession(magasin);
  return NextResponse.redirect(urlDeconnexionKeycloak(), 303);
}
