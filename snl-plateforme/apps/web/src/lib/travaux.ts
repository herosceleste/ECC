/** Libellés et mises en forme du module M1. */

export const CATEGORIES: Record<string, string> = {
  PLOMBERIE: 'Plomberie, fuite d’eau',
  ELECTRICITE: 'Électricité',
  GAZ: 'Gaz',
  CHAUFFAGE: 'Chauffage, eau chaude',
  MENUISERIE: 'Portes, fenêtres, volets',
  SERRURERIE: 'Serrure, clés',
  HUMIDITE: 'Humidité, moisissures',
  NUISIBLES: 'Nuisibles',
  ELECTROMENAGER: 'Électroménager',
  PARTIES_COMMUNES: 'Parties communes',
  AUTRE: 'Autre',
};

export const STATUTS: Record<string, { libelle: string; classe: string }> = {
  NOUVEAU: { libelle: 'Nouveau', classe: 'badge-alerte' },
  QUALIFIE: { libelle: 'Qualifié', classe: '' },
  PLANIFIE: { libelle: 'Planifié', classe: '' },
  EN_COURS: { libelle: 'En cours', classe: 'badge-alerte' },
  RESOLU: { libelle: 'Résolu', classe: 'badge-succes' },
  CLOS: { libelle: 'Clos', classe: 'badge-succes' },
  ANNULE: { libelle: 'Annulé', classe: '' },
};

/** Libellé du bouton qui mène à un statut. */
export const ACTIONS_STATUT: Record<string, string> = {
  EN_COURS: 'Démarrer',
  RESOLU: 'Marquer comme résolu',
  CLOS: 'Clore',
  ANNULE: 'Annuler le signalement',
};

export const PRIORITES: Record<string, string> = {
  URGENTE: 'Urgente',
  HAUTE: 'Haute',
  NORMALE: 'Normale',
  BASSE: 'Basse',
};

export const NATURES: Record<string, string> = {
  DEPANNAGE: 'Dépannage',
  ENTRETIEN: 'Entretien',
  TRAVAUX: 'Travaux',
};

export const NUMEROS_URGENCE = [
  { libelle: 'Urgence sécurité gaz (GRDF), 24 h sur 24', numero: '0 800 47 33 33', tel: '0800473333' },
  { libelle: 'Pompiers', numero: '18', tel: '18' },
  { libelle: 'Numéro d’urgence européen', numero: '112', tel: '112' },
];

export function euros(centimes: number): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(centimes / 100);
}

/** « 432,10 », « 432.1 » ou « 1 250 » → centimes ; null si la saisie est invalide. */
export function enCentimes(saisie: string | undefined): number | null {
  if (!saisie) return null;
  const nettoye = saisie.replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(nettoye)) return null;
  return Math.round(Number(nettoye) * 100);
}

export const options = (libelles: Record<string, string>) =>
  Object.entries(libelles).map(([valeur, libelle]) => ({ valeur, libelle }));
