import type { StatutInscription } from '@prisma/client';

/** Règles du module M2, isolées pour être testées seules. */

/** Une nouvelle inscription est confirmée s'il reste une place, sinon placée en liste d'attente. */
export function statutNouvelleInscription(places: number | null, inscrits: number): StatutInscription {
  return places === null || inscrits < places ? 'INSCRIT' : 'LISTE_ATTENTE';
}

/**
 * Après un désistement, la plus ancienne personne en liste d'attente prend
 * la place libérée (critère M2-1). Renvoie son identifiant d'inscription.
 */
export function aPromouvoir(
  places: number | null,
  inscriptions: { id: string; statut: StatutInscription; creeLe: Date }[],
): string | null {
  const inscrits = inscriptions.filter((i) => i.statut === 'INSCRIT').length;
  if (places !== null && inscrits >= places) return null;
  const attente = inscriptions
    .filter((i) => i.statut === 'LISTE_ATTENTE')
    .sort((a, b) => a.creeLe.getTime() - b.creeLe.getTime());
  return attente.at(0)?.id ?? null;
}

/**
 * M2-R03 : un téléphone masqué n'est visible que de son titulaire et des
 * personnes qui coordonnent le groupe.
 */
export function telephoneVisible(
  profil: { telephone: string | null; telephoneMasque: boolean },
  lecteur: { estTitulaire: boolean; coordonne: boolean },
): string | null {
  if (!profil.telephone) return null;
  return !profil.telephoneMasque || lecteur.estTitulaire || lecteur.coordonne ? profil.telephone : null;
}

const HEURE_MS = 3600 * 1000;
export const DELAI_RAPPEL_H = 24;
export const DELAI_ALERTE_SANS_INSCRIT_H = 48;

interface ActivitePlanifiable {
  debut: Date;
  annuleeLe: Date | null;
  rappelEnvoyeLe: Date | null;
  alerteSansInscritLe: Date | null;
  inscrits: number;
}

/** M2-F04 : rappel aux inscrits dans les 24 heures qui précèdent l'activité, une seule fois. */
export function doitRecevoirRappel(a: ActivitePlanifiable, maintenant: Date): boolean {
  const ecart = a.debut.getTime() - maintenant.getTime();
  return !a.annuleeLe && !a.rappelEnvoyeLe && a.inscrits > 0 && ecart > 0 && ecart <= DELAI_RAPPEL_H * HEURE_MS;
}

/** M2-R02 : alerte au coordinateur si personne n'est inscrit 48 heures avant, une seule fois. */
export function doitAlerterSansInscrit(a: ActivitePlanifiable, maintenant: Date): boolean {
  const ecart = a.debut.getTime() - maintenant.getTime();
  return (
    !a.annuleeLe && !a.alerteSansInscritLe && a.inscrits === 0 && ecart > 0 && ecart <= DELAI_ALERTE_SANS_INSCRIT_H * HEURE_MS
  );
}

// --- Export d'agenda (M2-F06), format iCalendar (RFC 5545) ----------------------------

export interface EvenementAgenda {
  id: string;
  titre: string;
  lieu: string | null;
  description: string | null;
  debut: Date;
  fin: Date;
  annule: boolean;
}

function echapper(texte: string): string {
  return texte.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function dateIcs(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** Les lignes de plus de 75 octets sont repliées, comme l'exige la norme. */
function replier(ligne: string): string {
  const octets = Buffer.from(ligne, 'utf8');
  if (octets.length <= 75) return ligne;
  const morceaux: string[] = [];
  let courant = '';
  for (const caractere of ligne) {
    if (Buffer.byteLength(courant + caractere, 'utf8') > (morceaux.length === 0 ? 75 : 74)) {
      morceaux.push(courant);
      courant = '';
    }
    courant += caractere;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

export function genererIcs(evenements: EvenementAgenda[], maintenant = new Date()): string {
  const lignes = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Plateforme SNL//Benevoles//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Plateforme SNL',
  ];
  for (const e of evenements) {
    lignes.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@plateforme-snl`,
      `DTSTAMP:${dateIcs(maintenant)}`,
      `DTSTART:${dateIcs(e.debut)}`,
      `DTEND:${dateIcs(e.fin)}`,
      `SUMMARY:${echapper(e.titre)}`,
      ...(e.lieu ? [`LOCATION:${echapper(e.lieu)}`] : []),
      ...(e.description ? [`DESCRIPTION:${echapper(e.description)}`] : []),
      `STATUS:${e.annule ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT',
    );
  }
  lignes.push('END:VCALENDAR');
  return `${lignes.map(replier).join('\r\n')}\r\n`;
}
