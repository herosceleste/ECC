import type { CategorieIntervention, StatutIntervention } from '@prisma/client';
import type { Role } from '@snl/shared';

/**
 * Règles métier du module M1, isolées du reste pour être testées seules.
 *
 * Cycle de vie d'une intervention :
 *
 *   NOUVEAU → QUALIFIE → PLANIFIE → EN_COURS → RESOLU → CLOS
 *                                       ↑          │
 *                                       └ rouvrir ─┘  (15 jours, M1-R02)
 *   … tout état non terminé → ANNULE
 */

/** Qui demande la transition. */
export interface Acteur {
  /** Détient « travaux:gerer » sur l'organisation du logement (coordinateur, gestionnaire). */
  gestionnaire: boolean;
  /** Est la personne à qui l'intervention est affectée. */
  affecte: boolean;
  /** Est la personne qui a signalé le problème. */
  signaleur: boolean;
}

export const DELAI_REOUVERTURE_JOURS = 15;

const TERMINES: StatutIntervention[] = ['CLOS', 'ANNULE'];

/**
 * Transitions de statut possibles et acteurs autorisés.
 * La qualification (NOUVEAU → QUALIFIE) et la planification (→ PLANIFIE)
 * passent par leurs propres actions, qui portent des données.
 */
const TRANSITIONS: Record<StatutIntervention, Partial<Record<StatutIntervention, (a: Acteur) => boolean>>> = {
  NOUVEAU: { ANNULE: (a) => a.gestionnaire },
  QUALIFIE: { EN_COURS: (a) => a.gestionnaire || a.affecte, ANNULE: (a) => a.gestionnaire },
  PLANIFIE: {
    EN_COURS: (a) => a.gestionnaire || a.affecte,
    RESOLU: (a) => a.gestionnaire || a.affecte,
    ANNULE: (a) => a.gestionnaire,
  },
  EN_COURS: { RESOLU: (a) => a.gestionnaire || a.affecte, ANNULE: (a) => a.gestionnaire },
  // M1-R02 : seul un coordinateur ou un gestionnaire clôt ; le signaleur peut rouvrir.
  RESOLU: { CLOS: (a) => a.gestionnaire, EN_COURS: (a) => a.gestionnaire || a.signaleur },
  CLOS: { EN_COURS: (a) => a.gestionnaire || a.signaleur },
  ANNULE: {},
};

export type RefusTransition =
  | 'TRANSITION_IMPOSSIBLE'
  | 'ACTEUR_NON_AUTORISE'
  | 'DELAI_REOUVERTURE_DEPASSE';

/**
 * Vérifie une transition. `resoluLe` sert au délai de réouverture : passé
 * 15 jours après la résolution, un problème qui revient fait l'objet d'un
 * nouveau signalement.
 */
export function verifierTransition(
  depuis: StatutIntervention,
  vers: StatutIntervention,
  acteur: Acteur,
  resoluLe: Date | null,
  maintenant = new Date(),
): RefusTransition | null {
  const regle = TRANSITIONS[depuis][vers];
  if (!regle) return 'TRANSITION_IMPOSSIBLE';
  if (!regle(acteur)) return 'ACTEUR_NON_AUTORISE';
  const reouverture = (depuis === 'RESOLU' || depuis === 'CLOS') && vers === 'EN_COURS';
  if (reouverture && !acteur.gestionnaire && resoluLe) {
    const delaiMs = DELAI_REOUVERTURE_JOURS * 24 * 3600 * 1000;
    if (maintenant.getTime() - resoluLe.getTime() > delaiMs) return 'DELAI_REOUVERTURE_DEPASSE';
  }
  return null;
}

/** Transitions proposées à un acteur, pour n'afficher que les boutons utiles. */
export function transitionsPossibles(
  depuis: StatutIntervention,
  acteur: Acteur,
  resoluLe: Date | null,
  maintenant = new Date(),
): StatutIntervention[] {
  return (Object.keys(TRANSITIONS[depuis]) as StatutIntervention[]).filter(
    (vers) => verifierTransition(depuis, vers, acteur, resoluLe, maintenant) === null,
  );
}

export function estTermine(statut: StatutIntervention): boolean {
  return TERMINES.includes(statut);
}

/** Qualification et affectation restent possibles tant que le travail n'est pas fait. */
export function estModifiable(statut: StatutIntervention): boolean {
  return ['NOUVEAU', 'QUALIFIE', 'PLANIFIE', 'EN_COURS'].includes(statut);
}

/** Catégories qu'un bénévole ne peut pas prendre en charge (M1-R03). */
export const CATEGORIES_PROFESSIONNELLES: CategorieIntervention[] = ['GAZ', 'ELECTRICITE'];

/**
 * M1-R03 : une intervention de gaz ou d'électricité ne peut être confiée qu'à
 * un artisan ou à un salarié, jamais à une personne qui n'est que bénévole.
 */
export function affectationAutorisee(categorie: CategorieIntervention, rolesDeLaPersonne: Role[]): boolean {
  if (!CATEGORIES_PROFESSIONNELLES.includes(categorie)) return true;
  return rolesDeLaPersonne.some((r) => r === 'GESTIONNAIRE' || r === 'COORDINATEUR');
}

/**
 * Catégories traitées d'office comme urgentes (M1-R01), en plus de la case
 * « urgence » cochée par la personne qui signale.
 */
export const CATEGORIES_TOUJOURS_URGENTES: CategorieIntervention[] = ['GAZ'];

export function estUrgent(categorie: CategorieIntervention, urgenceSignalee: boolean): boolean {
  return urgenceSignalee || CATEGORIES_TOUJOURS_URGENTES.includes(categorie);
}

/** Ajoute des mois à une date (au jour près, sans dépasser la fin du mois). */
export function ajouterMois(date: Date, mois: number): Date {
  const resultat = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + mois, 1));
  const dernierJour = new Date(Date.UTC(resultat.getUTCFullYear(), resultat.getUTCMonth() + 1, 0)).getUTCDate();
  resultat.setUTCDate(Math.min(date.getUTCDate(), dernierJour));
  return resultat;
}

/** Numéros affichés quand un signalement est urgent (M1-R01). */
export const NUMEROS_URGENCE = [
  { libelle: 'Urgence sécurité gaz (GRDF), 24 h sur 24', numero: '0 800 47 33 33' },
  { libelle: 'Pompiers', numero: '18' },
  { libelle: 'Numéro d’urgence européen', numero: '112' },
] as const;
