/**
 * Rôles et permissions de la plateforme (cahier des charges, section 3 du
 * document d'architecture). Un rôle est toujours attribué sur une
 * organisation ; il s'applique à cette organisation et à ses descendantes.
 */

export const ROLES = [
  'LOCATAIRE',
  'DEMANDEUR',
  'BENEVOLE',
  'COORDINATEUR',
  'TRAVAILLEUR_SOCIAL',
  'GESTIONNAIRE',
  'ADMINISTRATEUR',
  'PARTENAIRE',
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'organisation:lire',
  'organisation:gerer',
  'utilisateur:lire',
  'utilisateur:gerer',
  'module:gerer',
  'logement:lire',
  'logement:ecrire',
  'menage:lire',
  'menage:ecrire',
  'personne:lire',
  'personne:ecrire',
  'personne:lire_sensible',
  'document:lire',
  'document:ecrire',
  'audit:lire',
  'rgpd:traiter',
  // Module M1 Travaux et entretien
  'travaux:lire',
  'travaux:signaler',
  'travaux:gerer',
  'artisan:gerer',
  // Module M2 Coordination des bénévoles
  'benevoles:lire',
  'benevoles:gerer',
  'activite:participer',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Matrice rôle → permissions.
 *
 * Les rôles LOCATAIRE et DEMANDEUR n'ont ici aucune permission sur le
 * référentiel : ils n'accèdent qu'à leurs propres données, par des routes
 * dédiées des modules M6 et M7 (règle « propriétaire de la donnée »), et non
 * par les routes d'administration du socle.
 */
export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  LOCATAIRE: [],
  DEMANDEUR: [],
  PARTENAIRE: ['organisation:lire'],
  BENEVOLE: [
    'organisation:lire',
    'utilisateur:lire',
    'logement:lire',
    'menage:lire',
    'personne:lire',
    'document:lire',
    'travaux:lire',
    'travaux:signaler',
    'benevoles:lire',
    'activite:participer',
  ],
  COORDINATEUR: [
    'organisation:lire',
    'utilisateur:lire',
    'logement:lire',
    'logement:ecrire',
    'menage:lire',
    'personne:lire',
    'document:lire',
    'document:ecrire',
    'travaux:lire',
    'travaux:signaler',
    'travaux:gerer',
    'artisan:gerer',
    'benevoles:lire',
    'benevoles:gerer',
    'activite:participer',
  ],
  TRAVAILLEUR_SOCIAL: [
    'organisation:lire',
    'utilisateur:lire',
    'logement:lire',
    'menage:lire',
    'menage:ecrire',
    'personne:lire',
    'personne:ecrire',
    'personne:lire_sensible',
    'document:lire',
    'document:ecrire',
    'travaux:lire',
    'travaux:signaler',
    'benevoles:lire',
    'activite:participer',
  ],
  GESTIONNAIRE: [
    'organisation:lire',
    'utilisateur:lire',
    'logement:lire',
    'logement:ecrire',
    'menage:lire',
    'menage:ecrire',
    'personne:lire',
    'personne:ecrire',
    'document:lire',
    'document:ecrire',
    'travaux:lire',
    'travaux:signaler',
    'travaux:gerer',
    'artisan:gerer',
    'benevoles:lire',
    'benevoles:gerer',
    'activite:participer',
  ],
  ADMINISTRATEUR: [
    'organisation:lire',
    'organisation:gerer',
    'utilisateur:lire',
    'utilisateur:gerer',
    'module:gerer',
    'logement:lire',
    'menage:lire',
    'personne:lire',
    'document:lire',
    'audit:lire',
    'rgpd:traiter',
    'travaux:lire',
    'benevoles:lire',
  ],
};

/** Rôles pour lesquels le second facteur est obligatoire (exigence T-03). */
export const ROLES_SECOND_FACTEUR_OBLIGATOIRE: readonly Role[] = [
  'COORDINATEUR',
  'TRAVAILLEUR_SOCIAL',
  'GESTIONNAIRE',
  'ADMINISTRATEUR',
];

export function permissionsDuRole(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role];
}

export function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === 'string' && (ROLES as readonly string[]).includes(valeur);
}
