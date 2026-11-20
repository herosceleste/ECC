import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Organisation, type TypeOrganisation } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type { PrincipalAssociation } from '../auth/principal';
import { AutorisationService, filtrePerimetre } from '../autorisation/autorisation.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';

/** Types d'organisation qu'un parent peut accueillir (M0-F03). */
const ENFANTS_AUTORISES: Record<TypeOrganisation, TypeOrganisation[]> = {
  ASSOCIATION: ['ANTENNE', 'GROUPE_LOCAL'],
  ANTENNE: ['GROUPE_LOCAL'],
  GROUPE_LOCAL: [],
};

export interface NouvelleOrganisation {
  parentId: string;
  type: TypeOrganisation;
  nom: string;
  slug: string;
}

@Injectable()
export class OrganisationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
  ) {}

  /** Organisations visibles par le principal, triées pour former un arbre. */
  lister(principal: PrincipalAssociation): Promise<Organisation[]> {
    const perimetre = this.autorisation.perimetre(principal, 'organisation:lire');
    if (perimetre.length === 0) return Promise.resolve([]);
    return this.prisma.dansAssociation(principal.tenantId, (tx) =>
      tx.organisation.findMany({ where: filtrePerimetre(perimetre), orderBy: { chemin: 'asc' } }),
    );
  }

  obtenir(principal: PrincipalAssociation, id: string): Promise<Organisation> {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const organisation = await chargerOrganisation(tx, id);
      this.exigerOuMasquer(principal, 'organisation:lire', organisation.chemin);
      return organisation;
    });
  }

  creer(principal: PrincipalAssociation, donnees: NouvelleOrganisation): Promise<Organisation> {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const parent = await chargerOrganisation(tx, donnees.parentId);
      this.autorisation.exiger(principal, 'organisation:gerer', parent.chemin);

      if (!ENFANTS_AUTORISES[parent.type].includes(donnees.type)) {
        throw new BadRequestException(
          `Une organisation de type ${parent.type} ne peut pas contenir de ${donnees.type}.`,
        );
      }

      const id = randomUUID();
      try {
        return await tx.organisation.create({
          data: {
            id,
            tenantId: principal.tenantId,
            parentId: parent.id,
            type: donnees.type,
            nom: donnees.nom,
            slug: donnees.slug,
            chemin: `${parent.chemin}${id}/`,
          },
        });
      } catch (erreur) {
        if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === 'P2002') {
          throw new ConflictException('Cet identifiant court (slug) est déjà utilisé.');
        }
        throw erreur;
      }
    });
  }

  renommer(principal: PrincipalAssociation, id: string, nom: string): Promise<Organisation> {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const organisation = await chargerOrganisation(tx, id);
      this.autorisation.exiger(principal, 'organisation:gerer', organisation.chemin);
      return tx.organisation.update({ where: { id }, data: { nom } });
    });
  }

  /**
   * Hors du périmètre de lecture, on répond « introuvable » plutôt
   * qu'« interdit » pour ne pas révéler l'existence de la ressource.
   */
  private exigerOuMasquer(principal: PrincipalAssociation, permission: 'organisation:lire', chemin: string) {
    if (!this.autorisation.peut(principal, permission, chemin)) {
      throw new NotFoundException('Organisation introuvable.');
    }
  }
}

export async function chargerOrganisation(tx: Tx, id: string): Promise<Organisation> {
  const organisation = await tx.organisation.findUnique({ where: { id } });
  if (!organisation) throw new NotFoundException('Organisation introuvable.');
  return organisation;
}

/** Identifiants des organisations dont le chemin prolonge l'un des chemins donnés. */
export async function idsOrganisationsDuPerimetre(tx: Tx, chemins: string[]): Promise<string[]> {
  if (chemins.length === 0) return [];
  const lignes = await tx.organisation.findMany({
    where: filtrePerimetre(chemins),
    select: { id: true },
  });
  return lignes.map((l) => l.id);
}
