import { EncryptJWT, jwtDecrypt, type JWTPayload } from 'jose';

/**
 * Session stockée dans un cookie chiffré (JWE, AES-256-GCM), illisible et
 * infalsifiable côté navigateur. Les jetons ne quittent jamais le serveur :
 * le JavaScript de la page n'y a pas accès (cookie HttpOnly).
 *
 * Les jetons Keycloak sont volumineux : le cookie est découpé en morceaux
 * pour rester sous la limite de 4 Ko par cookie.
 */
export interface Session {
  jetonAcces: string;
  jetonRafraichissement?: string;
  /** Expiration du jeton d'accès, en millisecondes depuis l'époque Unix. */
  expireA: number;
  associationId?: string;
}

/** Échange OIDC en cours (entre la redirection vers Keycloak et le retour). */
export interface TransactionOidc {
  etat: string;
  verificateur: string;
  retour: string;
}

export interface MagasinCookies {
  get(nom: string): { value: string } | undefined;
  set(nom: string, valeur: string, options?: OptionsCookie): unknown;
  delete(nom: string): unknown;
}

export interface OptionsCookie {
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'lax' | 'strict';
  path: string;
  maxAge: number;
}

export const COOKIE_SESSION = 'snl_session';
export const COOKIE_TRANSACTION = 'snl_oidc';
const TAILLE_MORCEAU = 3500;
const MORCEAUX_MAX = 6;
const DUREE_SESSION_S = 10 * 3600;
const DUREE_TRANSACTION_S = 10 * 60;

function cle(secret: string): Uint8Array {
  const octets = Buffer.from(secret, 'base64');
  if (octets.length !== 32) throw new Error('Le secret de session doit faire 32 octets.');
  return new Uint8Array(octets);
}

export function optionsCookie(securise: boolean, maxAge: number): OptionsCookie {
  return { httpOnly: true, secure: securise, sameSite: 'lax', path: '/', maxAge };
}

export async function sceller<T extends object>(donnees: T, secret: string, dureeS: number): Promise<string> {
  return new EncryptJWT(donnees as JWTPayload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(`${dureeS}s`)
    .encrypt(cle(secret));
}

export async function ouvrir<T>(valeur: string, secret: string): Promise<T | null> {
  try {
    const { payload } = await jwtDecrypt(valeur, cle(secret));
    const { iat: _iat, exp: _exp, ...donnees } = payload;
    return donnees as T;
  } catch {
    return null;
  }
}

export async function lireSession(cookies: Pick<MagasinCookies, 'get'>, secret: string): Promise<Session | null> {
  const morceaux: string[] = [];
  for (let i = 0; i < MORCEAUX_MAX; i += 1) {
    const morceau = cookies.get(`${COOKIE_SESSION}.${i}`)?.value;
    if (!morceau) break;
    morceaux.push(morceau);
  }
  if (morceaux.length === 0) return null;
  const session = await ouvrir<Session>(morceaux.join(''), secret);
  return session && typeof session.jetonAcces === 'string' ? session : null;
}

export async function ecrireSession(
  cookies: MagasinCookies,
  session: Session,
  secret: string,
  securise: boolean,
): Promise<void> {
  const valeur = await sceller(session, secret, DUREE_SESSION_S);
  const morceaux = valeur.match(new RegExp(`.{1,${TAILLE_MORCEAU}}`, 'g')) ?? [];
  if (morceaux.length > MORCEAUX_MAX) throw new Error('Session trop volumineuse.');
  morceaux.forEach((m, i) => cookies.set(`${COOKIE_SESSION}.${i}`, m, optionsCookie(securise, DUREE_SESSION_S)));
  for (let i = morceaux.length; i < MORCEAUX_MAX; i += 1) {
    if (cookies.get(`${COOKIE_SESSION}.${i}`)) cookies.delete(`${COOKIE_SESSION}.${i}`);
  }
}

export function effacerSession(cookies: MagasinCookies): void {
  for (let i = 0; i < MORCEAUX_MAX; i += 1) {
    if (cookies.get(`${COOKIE_SESSION}.${i}`)) cookies.delete(`${COOKIE_SESSION}.${i}`);
  }
}

export async function ecrireTransaction(
  cookies: MagasinCookies,
  transaction: TransactionOidc,
  secret: string,
  securise: boolean,
): Promise<void> {
  const valeur = await sceller(transaction, secret, DUREE_TRANSACTION_S);
  cookies.set(COOKIE_TRANSACTION, valeur, optionsCookie(securise, DUREE_TRANSACTION_S));
}

export async function lireTransaction(cookies: Pick<MagasinCookies, 'get'>, secret: string): Promise<TransactionOidc | null> {
  const valeur = cookies.get(COOKIE_TRANSACTION)?.value;
  return valeur ? ouvrir<TransactionOidc>(valeur, secret) : null;
}

/** N'accepte qu'un chemin interne (« /logements »), jamais une adresse externe. */
export function retourSur(retour: string | null | undefined): string {
  if (!retour || !retour.startsWith('/') || retour.startsWith('//') || retour.includes('\\')) return '/';
  return retour;
}
