import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { aleatoire, urlAutorisation } from '@/lib/oidc';
import { ecrireTransaction, retourSur } from '@/lib/session';

/** Démarre la connexion : prépare PKCE puis redirige vers Keycloak. */
export async function GET(requete: NextRequest) {
  const c = config();
  const etat = aleatoire();
  const verificateur = aleatoire(48);
  await ecrireTransaction(
    await cookies(),
    { etat, verificateur, retour: retourSur(requete.nextUrl.searchParams.get('retour')) },
    c.SECRET_SESSION,
    c.URL_PUBLIQUE_WEB.startsWith('https://'),
  );
  return NextResponse.redirect(await urlAutorisation(etat, verificateur));
}
