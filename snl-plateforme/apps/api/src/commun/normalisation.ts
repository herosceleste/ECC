/**
 * Normalisation des champs utilisés pour repérer les doublons (règle M0-R01).
 */

/** « Élodie  DUPONT-Martin » → « elodie dupont martin ». */
export function normaliserNom(valeur: string): string {
  return valeur
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
}

/** « +33 6 12 34 56 78 » et « 06.12.34.56.78 » → « 0612345678 ». */
export function normaliserTelephone(valeur: string | null | undefined): string | null {
  if (!valeur) return null;
  let chiffres = valeur.replace(/\D+/g, '');
  if (chiffres.startsWith('0033')) chiffres = `0${chiffres.slice(4)}`;
  else if (chiffres.startsWith('33') && chiffres.length === 11) chiffres = `0${chiffres.slice(2)}`;
  return chiffres.length >= 6 ? chiffres : null;
}

export interface IdentitePersonne {
  nom: string;
  prenom: string;
  dateNaissance?: Date | null;
  telephone?: string | null;
}

/**
 * Deux fiches désignent probablement la même personne si :
 * - leurs nom et prénom normalisés coïncident et leurs dates de naissance ne
 *   se contredisent pas ;
 * - ou leurs nom et téléphone normalisés coïncident.
 */
export function estDoublonProbable(a: IdentitePersonne, b: IdentitePersonne): boolean {
  const memeNom = normaliserNom(a.nom) === normaliserNom(b.nom);
  if (!memeNom) return false;

  const memePrenom = normaliserNom(a.prenom) === normaliserNom(b.prenom);
  const datesConnues = a.dateNaissance && b.dateNaissance;
  const memeDate = datesConnues
    ? jourIso(a.dateNaissance as Date) === jourIso(b.dateNaissance as Date)
    : true;
  if (memePrenom && memeDate) return true;

  const telA = normaliserTelephone(a.telephone);
  const telB = normaliserTelephone(b.telephone);
  return telA !== null && telA === telB;
}

function jourIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
