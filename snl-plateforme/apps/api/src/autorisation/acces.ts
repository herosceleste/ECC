import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Permission } from '@snl/shared';
import type { Principal } from '../auth/principal';
import { chargerOrganisation } from '../organisations/organisations.service';
import type { Tx } from '../prisma/prisma.service';
import type { AutorisationService } from './autorisation.service';

/**
 * Vérifie une permission sur l'organisation qui porte une entité.
 *
 * - Sans aucun droit de lecture sur cette organisation, l'entité est déclarée
 *   introuvable (404) : on ne révèle pas son existence.
 * - Avec la lecture mais sans la permission demandée, l'accès est interdit (403).
 */
export async function exigerSurOrganisation(
  tx: Tx,
  autorisation: AutorisationService,
  principal: Principal,
  permission: Permission,
  organisationId: string,
  permissionDeLecture: Permission,
  libelle: string,
): Promise<string> {
  const organisation = await chargerOrganisation(tx, organisationId).catch(() => null);
  if (!organisation || !autorisation.peut(principal, permissionDeLecture, organisation.chemin)) {
    throw new NotFoundException(`${libelle} introuvable.`);
  }
  if (!autorisation.peut(principal, permission, organisation.chemin)) {
    throw new ForbiddenException('Vous n’avez pas les droits nécessaires pour cette action.');
  }
  return organisation.chemin;
}
