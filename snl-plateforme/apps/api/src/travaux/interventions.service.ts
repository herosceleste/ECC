import { ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type {
  CategorieIntervention,
  NatureIntervention,
  Prisma,
  PrioriteIntervention,
  StatutIntervention,
  TypeLigneCout,
} from '@prisma/client';
import type { Permission, Role } from '@snl/shared';
import type { PrincipalAssociation } from '../auth/principal';
import { exigerSurOrganisation } from '../autorisation/acces';
import { AutorisationService } from '../autorisation/autorisation.service';
import { CONFIGURATION, type Configuration } from '../config/configuration';
import { ligneeDepuisChemin, ModulesService } from '../modules-plateforme/modules.service';
import { Notificateur } from '../notifications/notificateur';
import { chargerOrganisation, idsOrganisationsDuPerimetre } from '../organisations/organisations.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import {
  affectationAutorisee,
  ajouterMois,
  estModifiable,
  estUrgent,
  NUMEROS_URGENCE,
  transitionsPossibles,
  verifierTransition,
  type Acteur,
} from './regles';

export const LIBELLES_CATEGORIES: Record<CategorieIntervention, string> = {
  PLOMBERIE: 'Plomberie, fuite d’eau',
  ELECTRICITE: 'Électricité',
  GAZ: 'Gaz',
  CHAUFFAGE: 'Chauffage, eau chaude',
  MENUISERIE: 'Portes, fenêtres, volets',
  SERRURERIE: 'Serrure, clés',
  HUMIDITE: 'Humidité, moisissures',
  NUISIBLES: 'Nuisibles',
  ELECTROMENAGER: 'Électroménager',
  PARTIES_COMMUNES: 'Parties communes',
  AUTRE: 'Autre',
};

const MESSAGES_REFUS: Record<string, string> = {
  TRANSITION_IMPOSSIBLE: 'Ce changement de statut n’est pas possible à cette étape.',
  ACTEUR_NON_AUTORISE: 'Votre rôle ne permet pas ce changement de statut.',
  DELAI_REOUVERTURE_DEPASSE:
    'Le délai de 15 jours pour rouvrir ce signalement est dépassé : créez un nouveau signalement.',
};

/** Rôles qui reçoivent l'alerte d'un signalement urgent (en attendant un planning d'astreinte). */
const ROLES_ASTREINTE: Role[] = ['GESTIONNAIRE', 'COORDINATEUR'];
/** Rôles à qui l'on peut confier une intervention. */
const ROLES_INTERVENANTS: Role[] = ['BENEVOLE', 'COORDINATEUR', 'GESTIONNAIRE', 'TRAVAILLEUR_SOCIAL'];

export interface NouveauSignalement {
  logementId: string;
  categorie: CategorieIntervention;
  description: string;
  urgenceSignalee: boolean;
}

export interface Affectation {
  utilisateurId?: string | null;
  artisanId?: string | null;
  datePrevue?: Date | null;
}

type Evenement = Omit<Prisma.EvenementInterventionUncheckedCreateInput, 'tenantId' | 'interventionId'>;

@Injectable()
export class InterventionsService {
  private readonly journal = new Logger('Travaux');

  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
    private readonly modules: ModulesService,
    private readonly notificateur: Notificateur,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  // --- Signalement (M1-F01, M1-R01) ---------------------------------------------

  async signaler(principal: PrincipalAssociation, donnees: NouveauSignalement) {
    const urgent = estUrgent(donnees.categorie, donnees.urgenceSignalee);
    const { intervention, logement, astreinte } = await this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const logement = await tx.logement.findUnique({ where: { id: donnees.logementId } });
      if (!logement) throw new NotFoundException('Logement introuvable.');
      await exigerSurOrganisation(
        tx, this.autorisation, principal, 'travaux:signaler', logement.organisationId, 'logement:lire', 'Logement',
      );
      await this.modules.exigerActif(tx, logement.organisationId, 'M1');

      const intervention = await tx.intervention.create({
        data: {
          tenantId: principal.tenantId,
          organisationId: logement.organisationId,
          logementId: logement.id,
          categorie: donnees.categorie,
          description: donnees.description,
          urgenceSignalee: donnees.urgenceSignalee,
          priorite: urgent ? 'URGENTE' : null,
          signalePar: principal.utilisateurId,
        },
      });
      const astreinte = urgent ? await this.destinatairesAstreinte(tx, logement.organisationId) : [];
      await this.tracer(tx, principal.tenantId, intervention.id, [
        { type: 'CREATION', auteurId: principal.utilisateurId, details: { urgent } },
        ...(urgent
          ? [{ type: 'ALERTE_URGENCE', details: { destinataires: astreinte.length } } satisfies Evenement]
          : []),
      ]);
      return { intervention, logement, astreinte };
    });

    // L'alerte part immédiatement, sans attendre la qualification (critère M1-2).
    // Le courriel ne contient aucune donnée personnelle : le détail est dans l'application.
    if (urgent) {
      await this.notifier(principal.tenantId, intervention.id, {
        destinataires: astreinte,
        sujet: `[URGENT] Signalement sur le logement ${logement.reference}`,
        texte:
          `Un signalement urgent vient d’être enregistré.\n\n` +
          `Logement : ${logement.reference}\nNature : ${LIBELLES_CATEGORIES[donnees.categorie]}\n\n` +
          `Consulter et prendre en charge : ${this.lien(intervention.id)}\n`,
      });
    }
    return {
      ...intervention,
      urgent,
      numerosUrgence: urgent ? NUMEROS_URGENCE : [],
    };
  }

  // --- Consultation -------------------------------------------------------------

  lister(
    principal: PrincipalAssociation,
    filtre: { statut?: StatutIntervention; organisationId?: string; logementId?: string; mesAffectations?: boolean },
  ) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      let ids = await this.organisationsLisibles(tx, principal);
      if (filtre.organisationId) ids = ids.filter((id) => id === filtre.organisationId);
      const interventions = await tx.intervention.findMany({
        where: {
          organisationId: { in: ids },
          statut: filtre.statut,
          logementId: filtre.logementId,
          affecteUtilisateurId: filtre.mesAffectations ? principal.utilisateurId : undefined,
        },
        include: {
          logement: { select: { id: true, reference: true } },
          affecteArtisan: { select: { id: true, raisonSociale: true } },
        },
        orderBy: { creeLe: 'desc' },
        take: 200,
      });
      const noms = await nomsUtilisateurs(tx, interventions.map((i) => i.affecteUtilisateurId));
      return interventions.map((i) => ({
        ...i,
        affecteUtilisateur: i.affecteUtilisateurId
          ? { id: i.affecteUtilisateurId, nomAffiche: noms.get(i.affecteUtilisateurId) ?? '—' }
          : null,
      }));
    });
  }

  obtenir(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const intervention = await tx.intervention.findUnique({
        where: { id },
        include: {
          logement: { select: { id: true, reference: true, organisationId: true } },
          affecteArtisan: { select: { id: true, raisonSociale: true, telephone: true } },
          evenements: { orderBy: { creeLe: 'asc' } },
          couts: { orderBy: { creeLe: 'asc' } },
        },
      });
      if (!intervention) throw new NotFoundException('Intervention introuvable.');
      const chemin = await this.exigerLecture(tx, principal, intervention.organisationId);

      const noms = await nomsUtilisateurs(tx, [
        intervention.signalePar,
        intervention.affecteUtilisateurId,
        ...intervention.evenements.map((e) => e.auteurId),
        ...intervention.couts.map((c) => c.saisiPar),
      ]);
      const acteur = this.acteur(principal, chemin, intervention);
      return {
        ...intervention,
        signaleParNom: noms.get(intervention.signalePar) ?? '—',
        affecteUtilisateur: intervention.affecteUtilisateurId
          ? { id: intervention.affecteUtilisateurId, nomAffiche: noms.get(intervention.affecteUtilisateurId) ?? '—' }
          : null,
        evenements: intervention.evenements.map((e) => ({ ...e, auteurNom: e.auteurId ? noms.get(e.auteurId) : null })),
        totaux: totaux(intervention.couts),
        droits: {
          gerer: acteur.gestionnaire,
          commenter: this.autorisation.peut(principal, 'travaux:signaler', chemin),
          transitions: transitionsPossibles(intervention.statut, acteur, intervention.resoluLe),
        },
      };
    });
  }

  /** Historique d'un logement : toutes ses interventions et leur coût (M1-F04). */
  historiqueLogement(principal: PrincipalAssociation, logementId: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const logement = await tx.logement.findUnique({ where: { id: logementId } });
      if (!logement) throw new NotFoundException('Logement introuvable.');
      await this.exigerLecture(tx, principal, logement.organisationId, 'Logement');
      const [interventions, entretiens] = await Promise.all([
        tx.intervention.findMany({
          where: { logementId },
          include: { couts: true },
          orderBy: { creeLe: 'desc' },
        }),
        tx.entretienPeriodique.findMany({ where: { logementId, actif: true }, orderBy: { prochaineEcheance: 'asc' } }),
      ]);
      const lignes = interventions.map(({ couts, ...i }) => ({ ...i, totaux: totaux(couts) }));
      return {
        logementId,
        interventions: lignes,
        entretiens,
        coutTotalCentimes: lignes.reduce((somme, i) => somme + i.totaux.facturesCentimes, 0),
      };
    });
  }

  /** Personnes et artisans à qui l'intervention peut être confiée. */
  affectables(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const intervention = await this.charger(tx, id);
      await this.exigerGestion(tx, principal, intervention.organisationId);
      const organisation = await chargerOrganisation(tx, intervention.organisationId);
      const lignee = ligneeDepuisChemin(organisation.chemin);

      const adhesions = await tx.adhesion.findMany({
        where: { organisationId: { in: lignee }, role: { in: ROLES_INTERVENANTS } },
        include: { utilisateur: { select: { id: true, nomAffiche: true, statut: true } } },
      });
      const personnes = new Map<string, { id: string; nomAffiche: string; roles: Role[] }>();
      for (const a of adhesions) {
        if (a.utilisateur.statut !== 'ACTIF') continue;
        const p = personnes.get(a.utilisateurId) ?? { id: a.utilisateurId, nomAffiche: a.utilisateur.nomAffiche, roles: [] };
        p.roles.push(a.role);
        personnes.set(a.utilisateurId, p);
      }
      const artisans = await tx.artisan.findMany({
        where: { organisationId: { in: lignee }, actif: true },
        orderBy: { raisonSociale: 'asc' },
      });
      return {
        personnes: [...personnes.values()]
          .map((p) => ({ ...p, autorisee: affectationAutorisee(intervention.categorie, p.roles) }))
          .sort((a, b) => a.nomAffiche.localeCompare(b.nomAffiche, 'fr')),
        artisans: artisans.map((a) => ({
          id: a.id,
          raisonSociale: a.raisonSociale,
          specialiste: a.specialites.includes(intervention.categorie),
        })),
      };
    });
  }

  // --- Gestion (M1-F02, M1-F03) ---------------------------------------------------

  qualifier(principal: PrincipalAssociation, id: string, donnees: { priorite: PrioriteIntervention; nature: NatureIntervention }) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const intervention = await this.charger(tx, id);
      await this.exigerGestion(tx, principal, intervention.organisationId);
      if (!estModifiable(intervention.statut)) {
        throw new ConflictException('Cette intervention est terminée : elle ne peut plus être qualifiée.');
      }
      const misAJour = await tx.intervention.update({
        where: { id },
        data: { ...donnees, statut: intervention.statut === 'NOUVEAU' ? 'QUALIFIE' : intervention.statut },
      });
      await this.tracer(tx, principal.tenantId, id, [
        { type: 'QUALIFICATION', auteurId: principal.utilisateurId, details: donnees },
      ]);
      return misAJour;
    });
  }

  async affecter(principal: PrincipalAssociation, id: string, donnees: Affectation) {
    const { misAJour, personne } = await this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const intervention = await this.charger(tx, id);
      await this.exigerGestion(tx, principal, intervention.organisationId);
      if (!estModifiable(intervention.statut)) {
        throw new ConflictException('Cette intervention est terminée : elle ne peut plus être affectée.');
      }
      if (donnees.utilisateurId && donnees.artisanId) {
        throw new ConflictException('Confiez l’intervention soit à une personne, soit à un artisan.');
      }

      const organisation = await chargerOrganisation(tx, intervention.organisationId);
      const lignee = ligneeDepuisChemin(organisation.chemin);
      let personne: { email: string; nomAffiche: string } | null = null;

      if (donnees.utilisateurId) {
        const adhesions = await tx.adhesion.findMany({
          where: { utilisateurId: donnees.utilisateurId, organisationId: { in: lignee }, role: { in: ROLES_INTERVENANTS } },
          include: { utilisateur: { select: { email: true, nomAffiche: true, statut: true } } },
        });
        const premiere = adhesions.at(0);
        if (!premiere || premiere.utilisateur.statut !== 'ACTIF') {
          throw new NotFoundException('Cette personne ne fait pas partie de l’équipe du logement.');
        }
        if (!affectationAutorisee(intervention.categorie, adhesions.map((a) => a.role))) {
          throw new ConflictException({
            message:
              'Les interventions de gaz ou d’électricité ne peuvent pas être confiées à un bénévole. Choisissez un artisan ou un salarié.',
            code: 'REGLE_M1_R03',
          });
        }
        personne = premiere.utilisateur;
      }
      if (donnees.artisanId) {
        const artisan = await tx.artisan.findUnique({ where: { id: donnees.artisanId } });
        if (!artisan || !artisan.actif || !lignee.includes(artisan.organisationId)) {
          throw new NotFoundException('Artisan introuvable pour ce logement.');
        }
      }

      const assigne = Boolean(donnees.utilisateurId || donnees.artisanId);
      const misAJour = await tx.intervention.update({
        where: { id },
        data: {
          affecteUtilisateurId: donnees.utilisateurId ?? null,
          affecteArtisanId: donnees.artisanId ?? null,
          datePrevue: donnees.datePrevue ?? null,
          statut: assigne && ['NOUVEAU', 'QUALIFIE'].includes(intervention.statut) ? 'PLANIFIE' : intervention.statut,
        },
      });
      await this.tracer(tx, principal.tenantId, id, [
        {
          type: 'AFFECTATION',
          auteurId: principal.utilisateurId,
          details: {
            utilisateurId: donnees.utilisateurId ?? null,
            artisanId: donnees.artisanId ?? null,
            datePrevue: donnees.datePrevue?.toISOString().slice(0, 10) ?? null,
          },
        },
      ]);
      return { misAJour, personne };
    });

    if (personne && donnees.utilisateurId !== principal.utilisateurId) {
      await this.notifier(principal.tenantId, id, {
        destinataires: [personne.email],
        sujet: 'Une intervention vous a été confiée',
        texte: `Bonjour ${personne.nomAffiche},\n\nUne intervention vous a été confiée sur la plateforme SNL.\n\nLa consulter : ${this.lien(id)}\n`,
      });
    }
    return misAJour;
  }

  async changerStatut(principal: PrincipalAssociation, id: string, vers: StatutIntervention, commentaire?: string) {
    const { misAJour, signaleur } = await this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const intervention = await this.charger(tx, id);
      const chemin = await this.exigerLecture(tx, principal, intervention.organisationId);
      const refus = verifierTransition(intervention.statut, vers, this.acteur(principal, chemin, intervention), intervention.resoluLe);
      if (refus) throw new ConflictException({ message: MESSAGES_REFUS[refus], code: refus });

      const maintenant = new Date();
      const misAJour = await tx.intervention.update({
        where: { id },
        data: {
          statut: vers,
          resoluLe: vers === 'RESOLU' ? maintenant : vers === 'EN_COURS' ? null : intervention.resoluLe,
          closLe: vers === 'CLOS' ? maintenant : null,
        },
      });
      await this.tracer(tx, principal.tenantId, id, [
        {
          type: 'CHANGEMENT_STATUT',
          auteurId: principal.utilisateurId,
          details: { de: intervention.statut, vers, ...(commentaire ? { commentaire } : {}) },
        },
      ]);

      // Un entretien périodique clos repart pour une nouvelle période.
      if (vers === 'CLOS' && intervention.entretienId) {
        const entretien = await tx.entretienPeriodique.findUnique({ where: { id: intervention.entretienId } });
        if (entretien) {
          await tx.entretienPeriodique.update({
            where: { id: entretien.id },
            data: {
              derniereRealisation: maintenant,
              prochaineEcheance: ajouterMois(maintenant, entretien.periodiciteMois),
            },
          });
        }
      }

      const signaleur =
        intervention.signalePar !== principal.utilisateurId
          ? await tx.utilisateur.findUnique({ where: { id: intervention.signalePar }, select: { email: true } })
          : null;
      return { misAJour, signaleur };
    });

    // M1-F03 : la personne qui a signalé est tenue informée de chaque étape.
    if (signaleur) {
      await this.notifier(principal.tenantId, id, {
        destinataires: [signaleur.email],
        sujet: 'Suivi de votre signalement',
        texte: `Le signalement que vous avez fait a changé d’étape : ${LIBELLES_STATUTS[vers]}.\n\nLe consulter : ${this.lien(id)}\n`,
      });
    }
    return misAJour;
  }

  commenter(principal: PrincipalAssociation, id: string, texte: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const intervention = await this.charger(tx, id);
      await this.exigerLecture(tx, principal, intervention.organisationId, 'Intervention', 'travaux:signaler');
      await this.tracer(tx, principal.tenantId, id, [
        { type: 'COMMENTAIRE', auteurId: principal.utilisateurId, details: { texte } },
      ]);
      return { id, organisationId: intervention.organisationId };
    });
  }

  /** Devis ou facture (M1-F06). Le coût d'une intervention est la somme de ses factures. */
  ajouterCout(
    principal: PrincipalAssociation,
    id: string,
    donnees: { type: TypeLigneCout; libelle: string; montantCentimes: number },
  ) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const intervention = await this.charger(tx, id);
      await this.exigerGestion(tx, principal, intervention.organisationId);
      const ligne = await tx.ligneCout.create({
        data: { ...donnees, tenantId: principal.tenantId, interventionId: id, saisiPar: principal.utilisateurId },
      });
      await this.tracer(tx, principal.tenantId, id, [
        { type: 'COUT', auteurId: principal.utilisateurId, details: { type: donnees.type, montantCentimes: donnees.montantCentimes } },
      ]);
      return { ...ligne, organisationId: intervention.organisationId };
    });
  }

  // --- Outils internes ----------------------------------------------------------

  private async charger(tx: Tx, id: string) {
    const intervention = await tx.intervention.findUnique({ where: { id } });
    if (!intervention) throw new NotFoundException('Intervention introuvable.');
    return intervention;
  }

  /** Lecture : permission, périmètre et module actif. Renvoie le chemin de l'organisation. */
  private async exigerLecture(
    tx: Tx,
    principal: PrincipalAssociation,
    organisationId: string,
    libelle = 'Intervention',
    permission: Permission = 'travaux:lire',
  ): Promise<string> {
    const chemin = await exigerSurOrganisation(
      tx, this.autorisation, principal, permission, organisationId, 'travaux:lire', libelle,
    );
    await this.modules.exigerActif(tx, organisationId, 'M1');
    return chemin;
  }

  private exigerGestion(tx: Tx, principal: PrincipalAssociation, organisationId: string) {
    return this.exigerLecture(tx, principal, organisationId, 'Intervention', 'travaux:gerer');
  }

  private acteur(
    principal: PrincipalAssociation,
    chemin: string,
    intervention: { affecteUtilisateurId: string | null; signalePar: string },
  ): Acteur {
    return {
      gestionnaire: this.autorisation.peut(principal, 'travaux:gerer', chemin),
      affecte: intervention.affecteUtilisateurId === principal.utilisateurId,
      signaleur: intervention.signalePar === principal.utilisateurId,
    };
  }

  private async organisationsLisibles(tx: Tx, principal: PrincipalAssociation): Promise<string[]> {
    const ids = await idsOrganisationsDuPerimetre(tx, this.autorisation.perimetre(principal, 'travaux:lire'));
    return this.modules.organisationsAvecModule(tx, ids, 'M1');
  }

  /** Adresses des coordinateurs et gestionnaires du logement et de ses organisations parentes. */
  private async destinatairesAstreinte(tx: Tx, organisationId: string): Promise<string[]> {
    const organisation = await chargerOrganisation(tx, organisationId);
    const adhesions = await tx.adhesion.findMany({
      where: { organisationId: { in: ligneeDepuisChemin(organisation.chemin) }, role: { in: ROLES_ASTREINTE } },
      include: { utilisateur: { select: { email: true, statut: true } } },
    });
    return [...new Set(adhesions.filter((a) => a.utilisateur.statut === 'ACTIF').map((a) => a.utilisateur.email))];
  }

  private tracer(tx: Tx, tenantId: string, interventionId: string, evenements: Evenement[]) {
    return tx.evenementIntervention.createMany({
      data: evenements.map((e) => ({ ...e, tenantId, interventionId })),
    });
  }

  /**
   * Une notification qui échoue ne doit ni annuler l'opération ni passer
   * inaperçue : l'échec est tracé dans le fil de l'intervention.
   */
  private async notifier(tenantId: string, interventionId: string, message: Parameters<Notificateur['envoyer']>[0]) {
    try {
      await this.notificateur.envoyer(message);
    } catch (erreur) {
      this.journal.error(`Notification non envoyée (${message.sujet}) : ${(erreur as Error).message}`);
      await this.prisma
        .dansAssociation(tenantId, (tx) =>
          this.tracer(tx, tenantId, interventionId, [{ type: 'NOTIFICATION_ECHEC', details: { sujet: message.sujet } }]),
        )
        .catch(() => undefined);
    }
  }

  private lien(interventionId: string): string {
    return `${this.config.URL_PUBLIQUE_WEB.replace(/\/$/, '')}/travaux/${interventionId}`;
  }
}

export const LIBELLES_STATUTS: Record<StatutIntervention, string> = {
  NOUVEAU: 'nouveau',
  QUALIFIE: 'qualifié',
  PLANIFIE: 'planifié',
  EN_COURS: 'en cours',
  RESOLU: 'résolu',
  CLOS: 'clos',
  ANNULE: 'annulé',
};

function totaux(couts: { type: TypeLigneCout; montantCentimes: number }[]) {
  return {
    devisCentimes: couts.filter((c) => c.type === 'DEVIS').reduce((s, c) => s + c.montantCentimes, 0),
    facturesCentimes: couts.filter((c) => c.type === 'FACTURE').reduce((s, c) => s + c.montantCentimes, 0),
  };
}

async function nomsUtilisateurs(tx: Tx, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniques = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (uniques.length === 0) return new Map();
  const utilisateurs = await tx.utilisateur.findMany({
    where: { id: { in: uniques } },
    select: { id: true, nomAffiche: true },
  });
  return new Map(utilisateurs.map((u) => [u.id, u.nomAffiche]));
}
