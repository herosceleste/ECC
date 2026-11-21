import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { config } from './config';
import { lireSession } from './session';

/** Erreur renvoyée par l'API, avec son message en français et le détail par champ. */
export class ErreurApi extends Error {
  constructor(
    readonly statut: number,
    message: string,
    readonly erreurs: { champ: string; message: string }[] = [],
    readonly code?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

interface OptionsAppel {
  methode?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corps?: unknown;
  formulaire?: FormData;
  /** Routes de l'API qui précèdent le choix d'une association (« moi », « espaces »). */
  sansAssociation?: boolean;
  /** Renvoie le corps tel quel (fichier d'agenda), sans l'interpréter comme du JSON. */
  brut?: boolean;
}

/**
 * Appel de l'API depuis le serveur Next, avec le jeton de la session et
 * l'association choisie. Sans session valide, on renvoie vers la connexion ;
 * le middleware s'est déjà chargé de rafraîchir un jeton proche d'expirer.
 */
export async function appelerApi<T>(chemin: string, options: OptionsAppel = {}): Promise<T> {
  const c = config();
  const session = await lireSession(await cookies(), c.SECRET_SESSION);
  if (!session) redirect('/connexion');
  if (!options.sansAssociation && !session.associationId) redirect('/espaces');

  const enTetes: Record<string, string> = { Authorization: `Bearer ${session.jetonAcces}` };
  if (session.associationId) enTetes['X-Association'] = session.associationId;
  let corps: BodyInit | undefined;
  if (options.formulaire) {
    corps = options.formulaire;
  } else if (options.corps !== undefined) {
    enTetes['Content-Type'] = 'application/json';
    corps = JSON.stringify(options.corps);
  }

  const reponse = await fetch(`${c.API_URL.replace(/\/$/, '')}/api/v1${chemin}`, {
    method: options.methode ?? 'GET',
    headers: enTetes,
    body: corps,
    cache: 'no-store',
  });

  if (reponse.status === 401) redirect('/connexion?expire=1');
  const texte = await reponse.text();
  if (options.brut && reponse.ok) return texte as T;
  const donnees: unknown = texte ? JSON.parse(texte) : null;
  if (!reponse.ok) throw erreurDepuisReponse(reponse.status, donnees);
  return donnees as T;
}

export function erreurDepuisReponse(statut: number, donnees: unknown): ErreurApi {
  const objet = (donnees ?? {}) as {
    message?: unknown;
    erreurs?: { champ: string; message: string }[];
    code?: string;
  };
  const message =
    typeof objet.message === 'string'
      ? objet.message
      : Array.isArray(objet.message)
        ? objet.message.join(' ')
        : messageParDefaut(statut);
  return new ErreurApi(statut, message, objet.erreurs ?? [], objet.code, objet as Record<string, unknown>);
}

function messageParDefaut(statut: number): string {
  if (statut === 403) return 'Vous n’avez pas les droits nécessaires pour cette action.';
  if (statut === 404) return 'Élément introuvable.';
  if (statut >= 500) return 'Le service rencontre un problème. Réessayez dans quelques instants.';
  return 'La demande n’a pas pu aboutir.';
}
