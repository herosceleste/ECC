import { permissionsDuRole, type Permission } from '@snl/shared';
import type { Adhesion } from './types';

/**
 * Droits côté interface : ils servent uniquement à masquer les actions
 * impossibles. L'API reste seule juge et refuse toute action non autorisée.
 */
export function peut(adhesions: Adhesion[], permission: Permission, chemin?: string): boolean {
  return adhesions.some(
    (a) => (chemin === undefined || chemin.startsWith(a.chemin)) && permissionsDuRole(a.role).includes(permission),
  );
}

export const LIBELLES_ROLES: Record<string, string> = {
  LOCATAIRE: 'Locataire',
  DEMANDEUR: 'Demandeur',
  BENEVOLE: 'Bénévole',
  COORDINATEUR: 'Coordinateur',
  TRAVAILLEUR_SOCIAL: 'Travailleur social',
  GESTIONNAIRE: 'Gestionnaire',
  ADMINISTRATEUR: 'Administrateur',
  PARTENAIRE: 'Partenaire',
};

export const LIBELLES_TYPES: Record<string, string> = {
  ASSOCIATION: 'Association',
  ANTENNE: 'Antenne',
  GROUPE_LOCAL: 'Groupe local',
};

export const LIBELLES_STATUTS_LOGEMENT: Record<string, string> = {
  DISPONIBLE: 'Disponible',
  OCCUPE: 'Occupé',
  EN_TRAVAUX: 'En travaux',
  HORS_PARC: 'Hors parc',
};
