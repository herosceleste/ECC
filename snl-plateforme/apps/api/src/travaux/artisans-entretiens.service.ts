import { Injectable, NotFoundException } from '@nestjs/common';
import type { CategorieIntervention } from '@prisma/client';
import type { PrincipalAssociation } from '../auth/principal';
import { exigerSurOrganisation } from '../autorisation/acces';
import { AutorisationService } from '../autorisation/autorisation.service';
import { ligneeDepuisChemin, ModulesService } from '../modules-plateforme/modules.service';
import { idsOrganisationsDuPerimetre } from '../organisations/organisations.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { ajouterMois } from './regles';

export interface DonneesArtisan {
  organisationId: string;
  raisonSociale: string;
  siret?: string | null;
  specialites: CategorieIntervention[];
  telephone?: string | null;
  email?: string | null;
}

export interface NouvelEntretien {
  logementId: string;
  libelle: string;
  categorie: CategorieIntervention;
  periodiciteMois: number;
  prochaineEcheance: Date;
}

/** Carnet d'artisans (M1-F05) et entretiens périodiques (M1-F07). */
@Injectable()
export class ArtisansEntretiensService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
    private readonly modules: ModulesService,
  ) {}

  // --- Artisans -------------------------------------------------------------------

  /**
   * Artisans utilisables : ceux des organisations visibles et ceux de leurs
   * organisations parentes (un artisan enregistré par l'antenne sert à tous
   * ses groupes).
   */
  listerArtisans(principal: PrincipalAssociation) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const perimetre = this.autorisation.perimetre(principal, 'travaux:lire');
      const descendants = await idsOrganisationsDuPerimetre(tx, perimetre);
      const ancetres = perimetre.flatMap(ligneeDepuisChemin);
      const ids = await this.modules.organisationsAvecModule(tx, [...new Set([...descendants, ...ancetres])], 'M1');
      return tx.artisan.findMany({ where: { organisationId: { in: ids } }, orderBy: { raisonSociale: 'asc' } });
    });
  }

  creerArtisan(principal: PrincipalAssociation, donnees: DonneesArtisan) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exiger(tx, principal, 'artisan:gerer', donnees.organisationId);
      return tx.artisan.create({ data: { ...donnees, tenantId: principal.tenantId } });
    });
  }

  modifierArtisan(principal: PrincipalAssociation, id: string, donnees: Partial<Omit<DonneesArtisan, 'organisationId'>> & { actif?: boolean }) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const artisan = await tx.artisan.findUnique({ where: { id } });
      if (!artisan) throw new NotFoundException('Artisan introuvable.');
      await this.exiger(tx, principal, 'artisan:gerer', artisan.organisationId);
      return tx.artisan.update({ where: { id }, data: donnees });
    });
  }

  // --- Entretiens périodiques -----------------------------------------------------------

  /** Entretiens dont l'échéance tombe dans les `jours` à venir, ou déjà dépassée. */
  listerEcheances(principal: PrincipalAssociation, jours: number) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const ids = await this.modules.organisationsAvecModule(
        tx,
        await idsOrganisationsDuPerimetre(tx, this.autorisation.perimetre(principal, 'travaux:lire')),
        'M1',
      );
      const limite = new Date(Date.now() + jours * 24 * 3600 * 1000);
      return tx.entretienPeriodique.findMany({
        where: { organisationId: { in: ids }, actif: true, prochaineEcheance: { lte: limite } },
        include: { logement: { select: { id: true, reference: true } } },
        orderBy: { prochaineEcheance: 'asc' },
      });
    });
  }

  creerEntretien(principal: PrincipalAssociation, donnees: NouvelEntretien) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const logement = await tx.logement.findUnique({ where: { id: donnees.logementId } });
      if (!logement) throw new NotFoundException('Logement introuvable.');
      await this.exiger(tx, principal, 'travaux:gerer', logement.organisationId);
      return tx.entretienPeriodique.create({
        data: { ...donnees, tenantId: principal.tenantId, organisationId: logement.organisationId },
      });
    });
  }

  /** Enregistre une réalisation et calcule la prochaine échéance. */
  marquerRealise(principal: PrincipalAssociation, id: string, date: Date) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const entretien = await this.chargerEntretien(tx, id);
      await this.exiger(tx, principal, 'travaux:gerer', entretien.organisationId);
      return tx.entretienPeriodique.update({
        where: { id },
        data: { derniereRealisation: date, prochaineEcheance: ajouterMois(date, entretien.periodiciteMois) },
      });
    });
  }

  /** Crée l'intervention correspondant à un entretien ; sa clôture fera repartir l'échéance. */
  creerIntervention(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const entretien = await this.chargerEntretien(tx, id);
      await this.exiger(tx, principal, 'travaux:gerer', entretien.organisationId);
      const intervention = await tx.intervention.create({
        data: {
          tenantId: principal.tenantId,
          organisationId: entretien.organisationId,
          logementId: entretien.logementId,
          categorie: entretien.categorie,
          description: `Entretien périodique : ${entretien.libelle}`,
          priorite: 'NORMALE',
          nature: 'ENTRETIEN',
          statut: 'QUALIFIE',
          signalePar: principal.utilisateurId,
          entretienId: entretien.id,
        },
      });
      await tx.evenementIntervention.create({
        data: {
          tenantId: principal.tenantId,
          interventionId: intervention.id,
          type: 'CREATION',
          auteurId: principal.utilisateurId,
          details: { entretienId: entretien.id },
        },
      });
      return intervention;
    });
  }

  private async chargerEntretien(tx: Tx, id: string) {
    const entretien = await tx.entretienPeriodique.findUnique({ where: { id } });
    if (!entretien) throw new NotFoundException('Entretien introuvable.');
    return entretien;
  }

  private async exiger(
    tx: Tx,
    principal: PrincipalAssociation,
    permission: 'artisan:gerer' | 'travaux:gerer',
    organisationId: string,
  ) {
    await exigerSurOrganisation(tx, this.autorisation, principal, permission, organisationId, 'travaux:lire', 'Élément');
    await this.modules.exigerActif(tx, organisationId, 'M1');
  }
}
