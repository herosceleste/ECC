import { dateCourte } from './format';
import type { Disponibilite } from './types';

/** Libellés et mises en forme du module M2. */

export const TYPES_ACTIVITE: Record<string, string> = {
  VISITE: 'Visite',
  CHANTIER: 'Chantier',
  PERMANENCE: 'Permanence',
  REUNION: 'Réunion',
  FORMATION: 'Formation',
  AUTRE: 'Autre',
};

export const JOURS = ['', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];

/** « compétences, séparées , par des virgules » → liste propre. */
export function enListe(texte: string | undefined): string[] {
  return (texte ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 20);
}

export function libelleDisponibilite(d: Disponibilite): string {
  const quand = d.jourSemaine ? `le ${JOURS[d.jourSemaine]}` : `le ${dateCourte(d.date)}`;
  return `${quand}, ${d.heureDebut.replace(':', ' h ')} – ${d.heureFin.replace(':', ' h ')}${d.commentaire ? ` (${d.commentaire})` : ''}`;
}
