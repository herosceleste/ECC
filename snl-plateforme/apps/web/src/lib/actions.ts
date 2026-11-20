import 'server-only';
import { unstable_rethrow } from 'next/navigation';
import { ErreurApi } from './api';

/** État renvoyé par une action de formulaire et affiché par <Formulaire>. */
export interface EtatAction {
  statut: 'repos' | 'succes' | 'erreur';
  message?: string;
  erreurs?: Record<string, string>;
  code?: string;
  details?: Record<string, unknown>;
  /** Valeurs saisies, renvoyées en cas d'erreur pour ne rien faire perdre. */
  valeurs?: Record<string, string>;
  /** Change à chaque envoi : permet de réinitialiser le formulaire après succès. */
  jalon?: number;
}

export const ETAT_INITIAL: EtatAction = { statut: 'repos' };

/**
 * Exécute une action et traduit les erreurs de l'API en état de formulaire.
 * Les redirections (succès qui mène à une autre page) sont laissées passer.
 */
export async function executer(
  donnees: FormData | null,
  travail: () => Promise<string | void>,
): Promise<EtatAction> {
  try {
    const message = await travail();
    return { statut: 'succes', message: message ?? 'Enregistré.', jalon: Date.now() };
  } catch (erreur) {
    unstable_rethrow(erreur);
    if (erreur instanceof ErreurApi) {
      return {
        statut: 'erreur',
        message: erreur.message,
        code: erreur.code,
        details: erreur.details,
        erreurs: Object.fromEntries(erreur.erreurs.map((e) => [e.champ, e.message])),
        valeurs: valeursSaisies(donnees),
        jalon: Date.now(),
      };
    }
    console.error(erreur);
    return {
      statut: 'erreur',
      message: 'Une erreur inattendue est survenue. Réessayez.',
      valeurs: valeursSaisies(donnees),
      jalon: Date.now(),
    };
  }
}

function valeursSaisies(donnees: FormData | null): Record<string, string> | undefined {
  if (!donnees) return undefined;
  const valeurs: Record<string, string> = {};
  donnees.forEach((valeur, cle) => {
    if (typeof valeur === 'string' && !cle.startsWith('$')) valeurs[cle] = valeur;
  });
  return valeurs;
}

/** Lit un champ texte : chaîne vide → undefined. */
export function texte(formulaire: FormData, nom: string): string | undefined {
  const valeur = formulaire.get(nom);
  if (typeof valeur !== 'string') return undefined;
  const nettoye = valeur.trim();
  return nettoye === '' ? undefined : nettoye;
}

/** Lit un champ numérique : vide → null (pour effacer), invalide → NaN (l'API le refusera). */
export function nombre(formulaire: FormData, nom: string): number | null {
  const valeur = texte(formulaire, nom);
  return valeur === undefined ? null : Number(valeur.replace(',', '.'));
}
