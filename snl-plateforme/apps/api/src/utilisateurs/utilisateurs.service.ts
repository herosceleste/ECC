import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ROLES_SECOND_FACTEUR_OBLIGATOIRE, type Role } from '@snl/shared';
import type { Principal, PrincipalAssociation } from '../auth/principal';
import { FournisseurIdentite } from '../auth/fournisseur-identite';
import { exigerSurOrganisation } from '../autorisation/acces';
import { AutorisationService } from '../autorisation/autorisation.service';
import { idsOrganisationsDuPerimetre } from '../organisations/organisations.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export interface DemandeInvitation {
  email: string;
  nomAffiche: string;
  organisationId: string;
  role: Role;
}

export interface EspaceUtilisateur {
  tenant_id: string;
  organisation_id: string;
  organisation_nom: string;
  role: string;
}

@Injectable()
export class UtilisateursService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
    private readonly identite: FournisseurIdentite,
  ) {}

  /** Profil de l'utilisateur connecté et ses rôles dans l'association courante. */
  moi(principal: Principal) {
    return {
      id: principal.utilisateurId,
      email: principal.email,
      nomAffiche: principal.nomAffiche,
      secondFacteur: principal.secondFacteur,
      associationId: principal.tenantId ?? null,
      adhesions: principal.adhesions,
    };
  }

  /** Associations et rôles de l'utilisateur, pour l'écran « choisir mon espace ». */
  espaces(principal: Principal): Promise<EspaceUtilisateur[]> {
    return this.prisma.$queryRaw<EspaceUtilisateur[]>`
      SELECT * FROM app_espaces_utilisateur(${principal.utilisateurId}::uuid)`;
  }

  /** Membres des organisations que le principal peut voir. */
  lister(principal: PrincipalAssociation, organisationId?: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const perimetre = this.autorisation.perimetre(principal, 'utilisateur:lire');
      let ids = await idsOrganisationsDuPerimetre(tx, perimetre);
      if (organisationId) ids = ids.filter((id) => id === organisationId);
      const adhesions = await tx.adhesion.findMany({
        where: { organisationId: { in: ids } },
        include: {
          utilisateur: { select: { id: true, email: true, nomAffiche: true, statut: true } },
          organisation: { select: { id: true, nom: true } },
        },
        orderBy: { creeLe: 'asc' },
      });
      return adhesions.map((a) => ({
        adhesionId: a.id,
        role: a.role,
        organisation: a.organisation,
        utilisateur: a.utilisateur,
      }));
    });
  }

  /**
   * Invite une personne (M0-F01) : crée son compte s'il n'existe pas, lui
   * attribue le rôle demandé et déclenche l'envoi du lien d'invitation.
   */
  async inviter(principal: PrincipalAssociation, demande: DemandeInvitation) {
    const email = demande.email.toLowerCase();
    const resultat = await this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exigerGestion(tx, principal, demande.organisationId);

      const existant = await tx.utilisateur.findUnique({ where: { email } });
      const utilisateur =
        existant ??
        (await tx.utilisateur.create({ data: { email, nomAffiche: demande.nomAffiche, statut: 'INVITE' } }));

      const adhesion = await this.ajouterAdhesion(tx, principal.tenantId, utilisateur.id, demande);

      // L'envoi a lieu dans la transaction : s'il échoue, rien n'est
      // enregistré et l'invitation peut simplement être relancée.
      if (!existant) {
        await this.identite.inviter({
          email,
          nomAffiche: demande.nomAffiche,
          exigerSecondFacteur: ROLES_SECOND_FACTEUR_OBLIGATOIRE.includes(demande.role),
        });
      }
      return { utilisateur, adhesion };
    });

    return {
      id: resultat.utilisateur.id,
      email: resultat.utilisateur.email,
      statut: resultat.utilisateur.statut,
      adhesionId: resultat.adhesion.id,
      organisationId: demande.organisationId,
    };
  }

  attribuerRole(principal: PrincipalAssociation, utilisateurId: string, organisationId: string, role: Role) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exigerGestion(tx, principal, organisationId);
      const utilisateur = await tx.utilisateur.findUnique({ where: { id: utilisateurId } });
      if (!utilisateur) throw new NotFoundException('Utilisateur introuvable.');
      const adhesion = await this.ajouterAdhesion(tx, principal.tenantId, utilisateurId, { organisationId, role });
      return { id: adhesion.id, organisationId, role };
    });
  }

  retirerRole(principal: PrincipalAssociation, adhesionId: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const adhesion = await tx.adhesion.findUnique({ where: { id: adhesionId } });
      if (!adhesion) throw new NotFoundException('Rôle introuvable.');
      await this.exigerGestion(tx, principal, adhesion.organisationId);

      if (adhesion.role === 'ADMINISTRATEUR' && adhesion.organisationId === principal.tenantId) {
        const administrateurs = await tx.adhesion.count({
          where: { organisationId: principal.tenantId, role: 'ADMINISTRATEUR' },
        });
        if (administrateurs <= 1) {
          throw new ConflictException('Impossible de retirer le dernier administrateur de l’association.');
        }
      }
      await tx.adhesion.delete({ where: { id: adhesionId } });
      return { id: adhesionId, organisationId: adhesion.organisationId };
    });
  }

  /**
   * Suspend ou réactive un compte. Le statut est global : on refuse donc la
   * suspension d'un compte qui appartient aussi à une autre association.
   */
  async changerStatut(principal: PrincipalAssociation, utilisateurId: string, suspendre: boolean) {
    const espaces = await this.prisma.$queryRaw<EspaceUtilisateur[]>`
      SELECT * FROM app_espaces_utilisateur(${utilisateurId}::uuid)`;
    if (espaces.length === 0) throw new NotFoundException('Utilisateur introuvable.');
    if (espaces.some((e) => e.tenant_id !== principal.tenantId)) {
      throw new ConflictException(
        'Ce compte appartient aussi à une autre association : retirez plutôt ses rôles dans la vôtre.',
      );
    }

    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      for (const espace of espaces) {
        await this.exigerGestion(tx, principal, espace.organisation_id);
      }
      if (utilisateurId === principal.utilisateurId) {
        throw new ConflictException('Vous ne pouvez pas suspendre votre propre compte.');
      }
      const utilisateur = await tx.utilisateur.update({
        where: { id: utilisateurId },
        data: { statut: suspendre ? 'SUSPENDU' : 'ACTIF' },
        select: { id: true, email: true, statut: true },
      });
      return utilisateur;
    });
  }

  private exigerGestion(tx: Tx, principal: Principal, organisationId: string) {
    return exigerSurOrganisation(
      tx, this.autorisation, principal, 'utilisateur:gerer', organisationId, 'organisation:lire', 'Organisation',
    );
  }

  private async ajouterAdhesion(
    tx: Tx,
    tenantId: string,
    utilisateurId: string,
    demande: { organisationId: string; role: Role },
  ) {
    const existante = await tx.adhesion.findUnique({
      where: {
        utilisateurId_organisationId_role: {
          utilisateurId,
          organisationId: demande.organisationId,
          role: demande.role,
        },
      },
    });
    if (existante) throw new ConflictException('Cette personne a déjà ce rôle dans cette organisation.');
    return tx.adhesion.create({
      data: { tenantId, utilisateurId, organisationId: demande.organisationId, role: demande.role },
    });
  }
}
