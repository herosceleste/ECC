import type { Role } from '@snl/shared';

/** Rôle détenu sur une organisation, avec le chemin de celle-ci. */
export interface AdhesionPrincipal {
  organisationId: string;
  chemin: string;
  role: Role;
}

/**
 * Identité authentifiée attachée à la requête. `tenantId` est l'association
 * choisie par l'utilisateur (en-tête X-Association) ; il est absent sur les
 * rares routes qui précèdent ce choix.
 */
export interface Principal {
  utilisateurId: string;
  sujet: string;
  email: string;
  nomAffiche: string;
  secondFacteur: boolean;
  tenantId?: string;
  adhesions: AdhesionPrincipal[];
}

/** Principal dont l'association est connue : requis par toutes les routes métier. */
export type PrincipalAssociation = Principal & { tenantId: string };
