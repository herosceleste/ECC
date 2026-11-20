import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { config } from '@/lib/config';
import { echangerCode } from '@/lib/oidc';
import { COOKIE_TRANSACTION, ecrireSession, lireTransaction } from '@/lib/session';

/** Retour de Keycloak : vérifie l'état, échange le code, ouvre la session. */
export async function GET(requete: NextRequest) {
  const c = config();
  const magasin = await cookies();
  const transaction = await lireTransaction(magasin, c.SECRET_SESSION);
  magasin.delete(COOKIE_TRANSACTION);

  const parametres = requete.nextUrl.searchParams;
  const echec = (motif: string) =>
    NextResponse.redirect(new URL(`/connexion?erreur=${motif}`, c.URL_PUBLIQUE_WEB));

  if (parametres.get('error')) return echec('refus');
  const code = parametres.get('code');
  if (!transaction || !code || parametres.get('state') !== transaction.etat) return echec('etat');

  try {
    const session = await echangerCode(code, transaction.verificateur);
    await ecrireSession(magasin, session, c.SECRET_SESSION, c.URL_PUBLIQUE_WEB.startsWith('https://'));
  } catch {
    return echec('jetons');
  }
  const destination = transaction.retour === '/' ? '/espaces' : transaction.retour;
  return NextResponse.redirect(new URL(destination, c.URL_PUBLIQUE_WEB));
}
