import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type StatutLogement } from '@prisma/client';
import type { PrincipalAssociation } from '../auth/principal';
import { exigerSurOrganisation } from '../autorisation/acces';
import { AutorisationService } from '../autorisation/autorisation.service';
import { idsOrganisationsDuPerimetre } from '../organisations/organisations.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export interface NouvelImmeuble {
  organisationId: string;
  ligneAdresse: string;
  codePostal: string;
  commune: string;
}

export interface DonneesLogement {
  organisationId: string;
  immeubleId?: string | null;
  reference: string;
  typologie: string;
  surfaceM2?: number | null;
  etage?: number | null;
  classeDpe?: string | null;
  statut?: StatutLogement;
}

@Injectable()
export class LogementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
  ) {}

  listerImmeubles(principal: PrincipalAssociation) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const ids = await this.idsLisibles(tx, principal);
      return tx.immeuble.findMany({ where: { organisationId: { in: ids } }, orderBy: { commune: 'asc' } });
    });
  }

  creerImmeuble(principal: PrincipalAssociation, donnees: NouvelImmeuble) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exiger(tx, principal, 'logement:ecrire', donnees.organisationId);
      return tx.immeuble.create({ data: { ...donnees, tenantId: principal.tenantId } });
    });
  }

  lister(principal: PrincipalAssociation, filtre: { organisationId?: string; statut?: StatutLogement }) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      let ids = await this.idsLisibles(tx, principal);
      if (filtre.organisationId) ids = ids.filter((id) => id === filtre.organisationId);
      return tx.logement.findMany({
        where: { organisationId: { in: ids }, statut: filtre.statut },
        include: { immeuble: true },
        orderBy: { reference: 'asc' },
      });
    });
  }

  obtenir(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const logement = await tx.logement.findUnique({ where: { id }, include: { immeuble: true } });
      if (!logement) throw new NotFoundException('Logement introuvable.');
      await this.exiger(tx, principal, 'logement:lire', logement.organisationId);
      return logement;
    });
  }

  creer(principal: PrincipalAssociation, donnees: DonneesLogement) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exiger(tx, principal, 'logement:ecrire', donnees.organisationId);
      await this.verifierImmeuble(tx, donnees.immeubleId, donnees.organisationId);
      return this.enregistrer(() =>
        tx.logement.create({ data: { ...donnees, tenantId: principal.tenantId } }),
      );
    });
  }

  modifier(principal: PrincipalAssociation, id: string, donnees: Partial<Omit<DonneesLogement, 'organisationId'>>) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const logement = await tx.logement.findUnique({ where: { id } });
      if (!logement) throw new NotFoundException('Logement introuvable.');
      await this.exiger(tx, principal, 'logement:ecrire', logement.organisationId);
      await this.verifierImmeuble(tx, donnees.immeubleId, logement.organisationId);
      return this.enregistrer(() => tx.logement.update({ where: { id }, data: donnees }));
    });
  }

  private async idsLisibles(tx: Tx, principal: PrincipalAssociation) {
    return idsOrganisationsDuPerimetre(tx, this.autorisation.perimetre(principal, 'logement:lire'));
  }

  private exiger(tx: Tx, principal: PrincipalAssociation, permission: 'logement:lire' | 'logement:ecrire', organisationId: string) {
    return exigerSurOrganisation(tx, this.autorisation, principal, permission, organisationId, 'logement:lire', 'Logement');
  }

  private async verifierImmeuble(tx: Tx, immeubleId: string | null | undefined, organisationId: string) {
    if (!immeubleId) return;
    const immeuble = await tx.immeuble.findUnique({ where: { id: immeubleId } });
    if (!immeuble || immeuble.organisationId !== organisationId) {
      throw new NotFoundException('Immeuble introuvable dans cette organisation.');
    }
  }

  private async enregistrer<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (erreur) {
      if (erreur instanceof Prisma.PrismaClientKnownRequestError && erreur.code === 'P2002') {
        throw new ConflictException('Un logement porte déjà cette référence.');
      }
      throw erreur;
    }
  }
}
