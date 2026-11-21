import type { Permission, Role } from '@snl/shared';
import type { PrincipalAssociation } from '../auth/principal';
import { exigerSurOrganisation } from '../autorisation/acces';
import type { AutorisationService } from '../autorisation/autorisation.service';
import type { ModulesService } from '../modules-plateforme/modules.service';
import { idsOrganisationsDuPerimetre } from '../organisations/organisations.service';
import type { Tx } from '../prisma/prisma.service';

/** Rôles qui font partie de l'équipe d'un groupe (annuaire, activités, référents). */
export const ROLES_EQUIPE: Role[] = ['BENEVOLE', 'COORDINATEUR', 'GESTIONNAIRE', 'TRAVAILLEUR_SOCIAL'];
/** Rôles qui reçoivent les alertes de coordination (désistement, activité sans inscrit). */
export const ROLES_COORDINATION: Role[] = ['COORDINATEUR', 'GESTIONNAIRE'];

/** Permission, périmètre et module M2 actif ; renvoie le chemin de l'organisation. */
export async function exigerM2(
  tx: Tx,
  autorisation: AutorisationService,
  modules: ModulesService,
  principal: PrincipalAssociation,
  permission: Permission,
  organisationId: string,
  libelle = 'Élément',
): Promise<string> {
  const chemin = await exigerSurOrganisation(
    tx, autorisation, principal, permission, organisationId, 'benevoles:lire', libelle,
  );
  await modules.exigerActif(tx, organisationId, 'M2');
  return chemin;
}

/** Organisations visibles où le module M2 est activé. */
export async function organisationsM2(
  tx: Tx,
  autorisation: AutorisationService,
  modules: ModulesService,
  principal: PrincipalAssociation,
): Promise<string[]> {
  const ids = await idsOrganisationsDuPerimetre(tx, autorisation.perimetre(principal, 'benevoles:lire'));
  return modules.organisationsAvecModule(tx, ids, 'M2');
}

export async function nomsUtilisateurs(tx: Tx, ids: string[]): Promise<Map<string, string>> {
  const uniques = [...new Set(ids)];
  if (uniques.length === 0) return new Map();
  const lignes = await tx.utilisateur.findMany({ where: { id: { in: uniques } }, select: { id: true, nomAffiche: true } });
  return new Map(lignes.map((l) => [l.id, l.nomAffiche]));
}
