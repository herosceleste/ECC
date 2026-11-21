import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Role } from '@snl/shared';
import type { PrincipalAssociation } from '../auth/principal';
import { AutorisationService } from '../autorisation/autorisation.service';
import { ConfidentialiteService } from '../confidentialite/confidentialite.service';
import { exigerSurOrganisation } from '../autorisation/acces';
import { ligneeDepuisChemin, ModulesService } from '../modules-plateforme/modules.service';
import { chargerOrganisation } from '../organisations/organisations.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { exigerM2, nomsUtilisateurs, organisationsM2, ROLES_EQUIPE } from './commun';
import { telephoneVisible } from './regles';

export interface DonneesProfil {
  telephone?: string | null;
  telephoneMasque?: boolean;
  competences?: string[];
  centresInteret?: string[];
  dateArrivee?: Date | null;
}

export interface NouvelleDisponibilite {
  jourSemaine?: number | null;
  date?: Date | null;
  heureDebut: string;
  heureFin: string;
  commentaire?: string | null;
}

/** Annuaire (M2-F01), disponibilités (M2-F02) et référents des ménages (M2-F05). */
@Injectable()
export class EquipeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
    private readonly modules: ModulesService,
    private readonly confidentialite: ConfidentialiteService,
  ) {}

  // --- Annuaire ---------------------------------------------------------------------

  annuaire(principal: PrincipalAssociation, organisationId?: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      let ids = await organisationsM2(tx, this.autorisation, this.modules, principal);
      if (organisationId) ids = ids.filter((id) => id === organisationId);
      const adhesions = await tx.adhesion.findMany({
        where: { organisationId: { in: ids }, role: { in: ROLES_EQUIPE } },
        include: {
          utilisateur: { select: { id: true, email: true, nomAffiche: true, statut: true } },
          organisation: { select: { id: true, nom: true, chemin: true } },
        },
      });
      const utilisateurs = [...new Set(adhesions.map((a) => a.utilisateurId))];
      const [profils, disponibilites] = await Promise.all([
        tx.profilBenevole.findMany({ where: { utilisateurId: { in: utilisateurs } } }),
        tx.disponibilite.findMany({ where: { utilisateurId: { in: utilisateurs } }, orderBy: [{ jourSemaine: 'asc' }, { date: 'asc' }] }),
      ]);

      const membres = new Map<string, {
        id: string; nomAffiche: string; email: string; statut: string;
        roles: { role: Role; organisation: { id: string; nom: string } }[]; coordonne: boolean;
      }>();
      for (const a of adhesions) {
        if (a.utilisateur.statut === 'SUSPENDU') continue;
        const m = membres.get(a.utilisateurId) ?? {
          id: a.utilisateurId, nomAffiche: a.utilisateur.nomAffiche, email: a.utilisateur.email,
          statut: a.utilisateur.statut, roles: [], coordonne: false,
        };
        m.roles.push({ role: a.role, organisation: { id: a.organisation.id, nom: a.organisation.nom } });
        m.coordonne ||= this.autorisation.peut(principal, 'benevoles:gerer', a.organisation.chemin);
        membres.set(a.utilisateurId, m);
      }

      return [...membres.values()]
        .map(({ coordonne, ...m }) => {
          const profil = profils.find((p) => p.utilisateurId === m.id);
          const estTitulaire = m.id === principal.utilisateurId;
          return {
            ...m,
            telephone: profil ? telephoneVisible(profil, { estTitulaire, coordonne }) : null,
            competences: profil?.competences ?? [],
            centresInteret: profil?.centresInteret ?? [],
            dateArrivee: profil?.dateArrivee ?? null,
            // Les disponibilités servent à organiser : coordinateurs et titulaire seulement.
            disponibilites: coordonne || estTitulaire ? disponibilites.filter((d) => d.utilisateurId === m.id) : undefined,
          };
        })
        .sort((x, y) => x.nomAffiche.localeCompare(y.nomAffiche, 'fr'));
    });
  }

  // --- Mon profil et mes disponibilités ------------------------------------------------

  monProfil(principal: PrincipalAssociation) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const [profil, disponibilites] = await Promise.all([
        tx.profilBenevole.findUnique({
          where: { tenantId_utilisateurId: { tenantId: principal.tenantId, utilisateurId: principal.utilisateurId } },
        }),
        tx.disponibilite.findMany({
          where: { utilisateurId: principal.utilisateurId },
          orderBy: [{ jourSemaine: 'asc' }, { date: 'asc' }, { heureDebut: 'asc' }],
        }),
      ]);
      return {
        profil: profil ?? { telephone: null, telephoneMasque: false, competences: [], centresInteret: [], dateArrivee: null },
        disponibilites,
      };
    });
  }

  modifierMonProfil(principal: PrincipalAssociation, donnees: DonneesProfil) {
    return this.prisma.dansAssociation(principal.tenantId, (tx) =>
      tx.profilBenevole.upsert({
        where: { tenantId_utilisateurId: { tenantId: principal.tenantId, utilisateurId: principal.utilisateurId } },
        create: { ...donnees, tenantId: principal.tenantId, utilisateurId: principal.utilisateurId },
        update: donnees,
      }),
    );
  }

  ajouterDisponibilite(principal: PrincipalAssociation, donnees: NouvelleDisponibilite) {
    if ((donnees.jourSemaine == null) === (donnees.date == null)) {
      throw new BadRequestException('Indiquez soit un jour de la semaine, soit une date.');
    }
    if (donnees.heureFin <= donnees.heureDebut) {
      throw new BadRequestException('L’heure de fin doit suivre l’heure de début.');
    }
    return this.prisma.dansAssociation(principal.tenantId, (tx) =>
      tx.disponibilite.create({ data: { ...donnees, tenantId: principal.tenantId, utilisateurId: principal.utilisateurId } }),
    );
  }

  supprimerDisponibilite(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const resultat = await tx.disponibilite.deleteMany({ where: { id, utilisateurId: principal.utilisateurId } });
      if (resultat.count === 0) throw new NotFoundException('Disponibilité introuvable.');
      return { id };
    });
  }

  // --- Référents des ménages (M2-F05, M2-R01) -------------------------------------------

  referents(principal: PrincipalAssociation, menageId: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const menage = await this.chargerMenage(tx, menageId);
      await exigerSurOrganisation(tx, this.autorisation, principal, 'menage:lire', menage.organisationId, 'menage:lire', 'Ménage');
      await this.modules.exigerActif(tx, menage.organisationId, 'M2');
      const referents = await tx.referent.findMany({ where: { menageId }, orderBy: { creeLe: 'asc' } });
      const noms = await nomsUtilisateurs(tx, referents.map((r) => r.utilisateurId));
      return referents.map((r) => ({ ...r, nomAffiche: noms.get(r.utilisateurId) ?? '—' }));
    });
  }

  ajouterReferent(principal: PrincipalAssociation, menageId: string, utilisateurId: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const menage = await this.chargerMenage(tx, menageId);
      await exigerM2(tx, this.autorisation, this.modules, principal, 'benevoles:gerer', menage.organisationId, 'Ménage');
      const organisation = await chargerOrganisation(tx, menage.organisationId);
      const membre = await tx.adhesion.findFirst({
        where: { utilisateurId, organisationId: { in: ligneeDepuisChemin(organisation.chemin) }, role: { in: ROLES_EQUIPE } },
      });
      if (!membre) throw new NotFoundException('Cette personne ne fait pas partie de l’équipe du ménage.');
      const existant = await tx.referent.findUnique({ where: { menageId_utilisateurId: { menageId, utilisateurId } } });
      if (existant) throw new ConflictException('Cette personne est déjà référente de ce ménage.');
      const referent = await tx.referent.create({ data: { tenantId: principal.tenantId, menageId, utilisateurId } });
      return { ...referent, organisationId: menage.organisationId };
    });
  }

  retirerReferent(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const referent = await tx.referent.findUnique({ where: { id } });
      if (!referent) throw new NotFoundException('Référent introuvable.');
      const menage = await this.chargerMenage(tx, referent.menageId);
      await exigerM2(tx, this.autorisation, this.modules, principal, 'benevoles:gerer', menage.organisationId, 'Ménage');
      await tx.referent.delete({ where: { id } });
      return { id, organisationId: menage.organisationId };
    });
  }

  /** Ménages dont je suis référent : nom et lien seulement, jamais de donnée sociale. */
  mesMenages(principal: PrincipalAssociation) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const referents = await tx.referent.findMany({ where: { utilisateurId: principal.utilisateurId } });
      const menages = await tx.menage.findMany({
        where: { id: { in: referents.map((r) => r.menageId) }, supprimeLe: null },
        select: { id: true, libelle: true, organisationId: true },
        orderBy: { libelle: 'asc' },
      });
      // M3-R01 : sans engagement signé, les ménages concernés n'apparaissent pas.
      const fermees = await this.confidentialite.organisationsFermees(tx, principal, menages.map((m) => m.organisationId));
      return menages.filter((m) => !fermees.has(m.organisationId));
    });
  }

  private async chargerMenage(tx: Tx, id: string) {
    const menage = await tx.menage.findFirst({ where: { id, supprimeLe: null } });
    if (!menage) throw new NotFoundException('Ménage introuvable.');
    return menage;
  }
}
