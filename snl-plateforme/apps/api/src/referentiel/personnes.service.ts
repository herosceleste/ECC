import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Permission } from '@snl/shared';
import type { PrincipalAssociation } from '../auth/principal';
import { exigerSurOrganisation } from '../autorisation/acces';
import { AutorisationService } from '../autorisation/autorisation.service';
import { ChiffrementService } from '../commun/chiffrement.service';
import { estDoublonProbable, normaliserNom, normaliserTelephone } from '../commun/normalisation';
import { idsOrganisationsDuPerimetre } from '../organisations/organisations.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';

/** Délai entre la suppression logique et la suppression définitive (M0-R02). */
export const DELAI_PURGE_JOURS = 30;

export interface DonneesPersonne {
  organisationId: string;
  menageId?: string | null;
  nom: string;
  prenom: string;
  dateNaissance?: Date | null;
  telephone?: string | null;
  email?: string | null;
}

const CHAMPS_PUBLICS = {
  id: true,
  organisationId: true,
  menageId: true,
  nom: true,
  prenom: true,
  dateNaissance: true,
  telephone: true,
  email: true,
  source: true,
  creeLe: true,
  modifieLe: true,
} as const;

@Injectable()
export class PersonnesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
    private readonly chiffrement: ChiffrementService,
  ) {}

  // --- Ménages -------------------------------------------------------------

  listerMenages(principal: PrincipalAssociation, organisationId?: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      let ids = await idsOrganisationsDuPerimetre(tx, this.autorisation.perimetre(principal, 'menage:lire'));
      if (organisationId) ids = ids.filter((id) => id === organisationId);
      return tx.menage.findMany({
        where: { organisationId: { in: ids }, supprimeLe: null },
        orderBy: { libelle: 'asc' },
      });
    });
  }

  obtenirMenage(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const menage = await tx.menage.findFirst({
        where: { id, supprimeLe: null },
        include: { personnes: { where: { supprimeLe: null }, select: CHAMPS_PUBLICS } },
      });
      if (!menage) throw new NotFoundException('Ménage introuvable.');
      await this.exiger(tx, principal, 'menage:lire', menage.organisationId, 'menage:lire', 'Ménage');
      return menage;
    });
  }

  creerMenage(principal: PrincipalAssociation, donnees: { organisationId: string; libelle: string }) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exiger(tx, principal, 'menage:ecrire', donnees.organisationId, 'menage:lire', 'Ménage');
      return tx.menage.create({ data: { ...donnees, tenantId: principal.tenantId } });
    });
  }

  // --- Personnes -----------------------------------------------------------

  obtenir(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const personne = await this.chargerPersonne(tx, id);
      await this.exiger(tx, principal, 'personne:lire', personne.organisationId);
      return personne;
    });
  }

  /**
   * Crée une personne après recherche de doublons (M0-R01). Un doublon
   * probable bloque la création, sauf confirmation explicite ; s'il se trouve
   * hors du périmètre de l'utilisateur, on le signale sans rien en révéler.
   */
  creer(principal: PrincipalAssociation, donnees: DonneesPersonne, confirmerMalgreDoublon: boolean) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exiger(tx, principal, 'personne:ecrire', donnees.organisationId);
      await this.verifierMenage(tx, donnees.menageId, donnees.organisationId);

      const nomNormalise = normaliserNom(donnees.nom);
      const telephoneNormalise = normaliserTelephone(donnees.telephone);

      if (!confirmerMalgreDoublon) {
        await this.refuserSiDoublon(tx, principal, donnees, nomNormalise, telephoneNormalise);
      }

      return tx.personne.create({
        data: { ...donnees, tenantId: principal.tenantId, nomNormalise, telephoneNormalise },
        select: CHAMPS_PUBLICS,
      });
    });
  }

  modifier(principal: PrincipalAssociation, id: string, donnees: Partial<Omit<DonneesPersonne, 'organisationId'>>) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const personne = await this.chargerPersonne(tx, id);
      await this.exiger(tx, principal, 'personne:ecrire', personne.organisationId);
      await this.verifierMenage(tx, donnees.menageId, personne.organisationId);
      return tx.personne.update({
        where: { id },
        data: {
          ...donnees,
          ...(donnees.nom !== undefined ? { nomNormalise: normaliserNom(donnees.nom) } : {}),
          ...(donnees.telephone !== undefined
            ? { telephoneNormalise: normaliserTelephone(donnees.telephone) }
            : {}),
        },
        select: CHAMPS_PUBLICS,
      });
    });
  }

  /** Suppression logique : la fiche disparaît, la purge définitive suit après 30 jours. */
  supprimer(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const personne = await this.chargerPersonne(tx, id);
      await this.exiger(tx, principal, 'personne:ecrire', personne.organisationId);
      await tx.personne.update({ where: { id }, data: { supprimeLe: new Date() } });
      return { id, organisationId: personne.organisationId, purgeDefinitiveApresJours: DELAI_PURGE_JOURS };
    });
  }

  // --- Données sensibles ---------------------------------------------------

  lireDonneesSensibles(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const personne = await this.chargerPersonne(tx, id);
      await this.exiger(tx, principal, 'personne:lire_sensible', personne.organisationId);
      const ligne = await tx.donneesSensibles.findUnique({ where: { personneId: id } });
      return {
        id,
        organisationId: personne.organisationId,
        donnees: ligne ? this.chiffrement.dechiffrer(ligne, id) : null,
      };
    });
  }

  ecrireDonneesSensibles(principal: PrincipalAssociation, id: string, donnees: Record<string, unknown>) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const personne = await this.chargerPersonne(tx, id);
      await this.exiger(tx, principal, 'personne:lire_sensible', personne.organisationId);
      await this.exiger(tx, principal, 'personne:ecrire', personne.organisationId);
      const chiffre = this.chiffrement.chiffrer(donnees, id);
      await tx.donneesSensibles.upsert({
        where: { personneId: id },
        create: { personneId: id, tenantId: principal.tenantId, ...chiffre },
        update: chiffre,
      });
      return { id, organisationId: personne.organisationId };
    });
  }

  // --- Droits des personnes (M0-F10) ----------------------------------------

  /** Export complet des données d'une personne, pour le droit d'accès ou de portabilité. */
  exporter(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const personne = await tx.personne.findUnique({
        where: { id },
        include: { menage: true, donneesSensibles: true },
      });
      if (!personne) throw new NotFoundException('Personne introuvable.');
      await this.exiger(tx, principal, 'rgpd:traiter', personne.organisationId);

      const documents = await tx.document.findMany({
        where: { entiteType: 'personne', entiteId: id },
        select: { id: true, categorie: true, nomFichier: true, creeLe: true, version: true },
      });
      const { donneesSensibles, nomNormalise: _n, telephoneNormalise: _t, ...identite } = personne;
      return {
        id,
        organisationId: personne.organisationId,
        exporteLe: new Date().toISOString(),
        identite,
        donneesSensibles: donneesSensibles ? this.chiffrement.dechiffrer(donneesSensibles, id) : null,
        documents,
      };
    });
  }

  // --- Outils internes -------------------------------------------------------

  private async chargerPersonne(tx: Tx, id: string) {
    const personne = await tx.personne.findFirst({ where: { id, supprimeLe: null }, select: CHAMPS_PUBLICS });
    if (!personne) throw new NotFoundException('Personne introuvable.');
    return personne;
  }

  private exiger(
    tx: Tx,
    principal: PrincipalAssociation,
    permission: Permission,
    organisationId: string,
    lecture: Permission = 'personne:lire',
    libelle = 'Personne',
  ) {
    return exigerSurOrganisation(tx, this.autorisation, principal, permission, organisationId, lecture, libelle);
  }

  private async verifierMenage(tx: Tx, menageId: string | null | undefined, organisationId: string) {
    if (!menageId) return;
    const menage = await tx.menage.findFirst({ where: { id: menageId, supprimeLe: null } });
    if (!menage || menage.organisationId !== organisationId) {
      throw new NotFoundException('Ménage introuvable dans cette organisation.');
    }
  }

  private async refuserSiDoublon(
    tx: Tx,
    principal: PrincipalAssociation,
    donnees: DonneesPersonne,
    nomNormalise: string,
    telephoneNormalise: string | null,
  ) {
    const candidats = await tx.personne.findMany({
      where: {
        supprimeLe: null,
        OR: [{ nomNormalise }, ...(telephoneNormalise ? [{ telephoneNormalise }] : [])],
      },
      select: { ...CHAMPS_PUBLICS },
      take: 50,
    });
    const doublons = candidats.filter((c) => estDoublonProbable(donnees, c));
    if (doublons.length === 0) return;

    const chemins = await tx.organisation.findMany({
      where: { id: { in: doublons.map((d) => d.organisationId) } },
      select: { id: true, chemin: true },
    });
    const visibles = doublons.filter((d) => {
      const chemin = chemins.find((c) => c.id === d.organisationId)?.chemin;
      return chemin !== undefined && this.autorisation.peut(principal, 'personne:lire', chemin);
    });

    throw new ConflictException({
      message:
        visibles.length > 0
          ? 'Une personne très proche existe déjà. Vérifiez avant de créer une nouvelle fiche.'
          : 'Une personne très proche existe déjà dans une autre organisation. Contactez un gestionnaire.',
      code: 'DOUBLON_PROBABLE',
      doublons: visibles.map((d) => ({ id: d.id, nom: d.nom, prenom: d.prenom, organisationId: d.organisationId })),
    });
  }
}
