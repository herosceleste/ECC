import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import type { TypeActivite } from '@prisma/client';
import type { PrincipalAssociation } from '../auth/principal';
import { AutorisationService } from '../autorisation/autorisation.service';
import { CONFIGURATION, type Configuration } from '../config/configuration';
import { ligneeDepuisChemin, ModulesService } from '../modules-plateforme/modules.service';
import { Notificateur, type Message } from '../notifications/notificateur';
import { chargerOrganisation } from '../organisations/organisations.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { exigerM2, nomsUtilisateurs, organisationsM2, ROLES_COORDINATION } from './commun';
import {
  aPromouvoir,
  DELAI_ALERTE_SANS_INSCRIT_H,
  doitAlerterSansInscrit,
  doitRecevoirRappel,
  genererIcs,
  statutNouvelleInscription,
} from './regles';

export interface NouvelleActivite {
  organisationId: string;
  type: TypeActivite;
  titre: string;
  description?: string | null;
  lieu?: string | null;
  debut: Date;
  fin: Date;
  places?: number | null;
  interventionId?: string | null;
}

const INTERVALLE_TACHES_MS = 15 * 60 * 1000;

/**
 * Activités du groupe (M2-F03), inscriptions et liste d'attente (critère M2-1),
 * désistements (critère M2-2), export d'agenda (M2-F06), rappels (M2-F04) et
 * alerte des activités sans inscrit (M2-R02).
 */
@Injectable()
export class ActivitesService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger('Benevoles');
  private minuterie: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
    private readonly modules: ModulesService,
    private readonly notificateur: Notificateur,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  // --- Consultation -------------------------------------------------------------------

  lister(principal: PrincipalAssociation, filtre: { du?: Date; au?: Date; organisationId?: string }) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      let ids = await organisationsM2(tx, this.autorisation, this.modules, principal);
      if (filtre.organisationId) ids = ids.filter((id) => id === filtre.organisationId);
      const du = filtre.du ?? new Date(Date.now() - 86_400_000);
      const au = filtre.au ?? new Date(Date.now() + 60 * 86_400_000);
      const activites = await tx.activite.findMany({
        where: { organisationId: { in: ids }, debut: { gte: du, lte: au } },
        include: { inscriptions: { select: { utilisateurId: true, statut: true } } },
        orderBy: { debut: 'asc' },
      });
      return activites.map(({ inscriptions, ...a }) => ({
        ...a,
        inscrits: inscriptions.filter((i) => i.statut === 'INSCRIT').length,
        enAttente: inscriptions.filter((i) => i.statut === 'LISTE_ATTENTE').length,
        monStatut: inscriptions.find((i) => i.utilisateurId === principal.utilisateurId)?.statut ?? null,
      }));
    });
  }

  obtenir(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const activite = await tx.activite.findUnique({
        where: { id },
        include: { inscriptions: { orderBy: { creeLe: 'asc' } } },
      });
      if (!activite) throw new NotFoundException('Activité introuvable.');
      const chemin = await exigerM2(tx, this.autorisation, this.modules, principal, 'benevoles:lire', activite.organisationId, 'Activité');
      const noms = await nomsUtilisateurs(tx, [activite.creePar, ...activite.inscriptions.map((i) => i.utilisateurId)]);
      const actives = activite.inscriptions.filter((i) => i.statut !== 'DESISTE');
      return {
        ...activite,
        creeParNom: noms.get(activite.creePar) ?? '—',
        inscriptions: actives.map((i) => ({ statut: i.statut, utilisateurId: i.utilisateurId, nomAffiche: noms.get(i.utilisateurId) ?? '—' })),
        inscrits: actives.filter((i) => i.statut === 'INSCRIT').length,
        monStatut: activite.inscriptions.find((i) => i.utilisateurId === principal.utilisateurId)?.statut ?? null,
        droits: {
          gerer: this.autorisation.peut(principal, 'benevoles:gerer', chemin),
          participer: this.autorisation.peut(principal, 'activite:participer', chemin),
        },
      };
    });
  }

  // --- Gestion ---------------------------------------------------------------------------

  creer(principal: PrincipalAssociation, donnees: NouvelleActivite) {
    if (donnees.fin <= donnees.debut) throw new BadRequestException('L’activité doit finir après avoir commencé.');
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const chemin = await exigerM2(tx, this.autorisation, this.modules, principal, 'benevoles:gerer', donnees.organisationId, 'Organisation');
      if (donnees.interventionId) {
        // Chantier collectif (M1-F08) : l'intervention doit relever de cette organisation.
        const intervention = await tx.intervention.findUnique({ where: { id: donnees.interventionId } });
        const orgIntervention = intervention ? await chargerOrganisation(tx, intervention.organisationId) : null;
        if (!orgIntervention || !orgIntervention.chemin.startsWith(chemin)) {
          throw new NotFoundException('Intervention introuvable pour cette organisation.');
        }
      }
      return tx.activite.create({ data: { ...donnees, tenantId: principal.tenantId, creePar: principal.utilisateurId } });
    });
  }

  async annuler(principal: PrincipalAssociation, id: string) {
    const { activite, destinataires } = await this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const activite = await this.chargerActivite(tx, id);
      await exigerM2(tx, this.autorisation, this.modules, principal, 'benevoles:gerer', activite.organisationId, 'Activité');
      if (activite.annuleeLe) throw new ConflictException('Cette activité est déjà annulée.');
      const misAJour = await tx.activite.update({ where: { id }, data: { annuleeLe: new Date() } });
      const inscrits = await tx.inscription.findMany({ where: { activiteId: id, statut: { in: ['INSCRIT', 'LISTE_ATTENTE'] } } });
      return { activite: misAJour, destinataires: await this.adresses(tx, inscrits.map((i) => i.utilisateurId)) };
    });
    await this.notifier({
      destinataires,
      sujet: `Activité annulée : ${activite.titre}`,
      texte: `L’activité « ${activite.titre} » prévue le ${dateLisible(activite.debut)} est annulée.\n\n${this.lien(id)}\n`,
    });
    return activite;
  }

  // --- Inscription et désistement ------------------------------------------------------

  inscrire(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      // Verrou sur l'activité : deux inscriptions simultanées ne peuvent pas prendre la même dernière place.
      await tx.$queryRaw`SELECT id FROM activite WHERE id = ${id}::uuid FOR UPDATE`;
      const activite = await this.chargerActivite(tx, id);
      await exigerM2(tx, this.autorisation, this.modules, principal, 'activite:participer', activite.organisationId, 'Activité');
      if (activite.annuleeLe) throw new ConflictException('Cette activité est annulée.');
      if (activite.debut <= new Date()) throw new ConflictException('Cette activité a déjà commencé.');

      const inscrits = await tx.inscription.count({ where: { activiteId: id, statut: 'INSCRIT' } });
      const statut = statutNouvelleInscription(activite.places, inscrits);
      const existante = await tx.inscription.findUnique({
        where: { activiteId_utilisateurId: { activiteId: id, utilisateurId: principal.utilisateurId } },
      });
      if (existante && existante.statut !== 'DESISTE') throw new ConflictException('Vous êtes déjà inscrit à cette activité.');
      // Une réinscription repasse en fin de liste d'attente : creeLe est remis à maintenant.
      const inscription = existante
        ? await tx.inscription.update({ where: { id: existante.id }, data: { statut, creeLe: new Date() } })
        : await tx.inscription.create({
            data: { tenantId: principal.tenantId, activiteId: id, utilisateurId: principal.utilisateurId, statut },
          });
      return { ...inscription, organisationId: activite.organisationId };
    });
  }

  /** Désistement en un geste (M2-F04) : la place passe à la liste d'attente, la coordination est prévenue. */
  async desister(principal: PrincipalAssociation, id: string) {
    const resultat = await this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM activite WHERE id = ${id}::uuid FOR UPDATE`;
      const activite = await this.chargerActivite(tx, id);
      await exigerM2(tx, this.autorisation, this.modules, principal, 'activite:participer', activite.organisationId, 'Activité');
      const inscription = await tx.inscription.findUnique({
        where: { activiteId_utilisateurId: { activiteId: id, utilisateurId: principal.utilisateurId } },
      });
      if (!inscription || inscription.statut === 'DESISTE') throw new NotFoundException('Vous n’êtes pas inscrit à cette activité.');
      await tx.inscription.update({ where: { id: inscription.id }, data: { statut: 'DESISTE' } });

      let promu: string | null = null;
      if (inscription.statut === 'INSCRIT') {
        const toutes = await tx.inscription.findMany({ where: { activiteId: id } });
        const aPromouvoirId = aPromouvoir(activite.places, toutes);
        if (aPromouvoirId) {
          const p = await tx.inscription.update({ where: { id: aPromouvoirId }, data: { statut: 'INSCRIT' } });
          promu = p.utilisateurId;
        }
      }
      const coordination = await this.adressesCoordination(tx, activite.organisationId);
      const [adressePromu] = promu ? await this.adresses(tx, [promu]) : [];
      return { activite, promu: adressePromu, coordination, etaitInscrit: inscription.statut === 'INSCRIT' };
    });

    const { activite } = resultat;
    // Critère M2-2 : la coordination est prévenue immédiatement d'un désistement.
    if (resultat.etaitInscrit) {
      await this.notifier({
        destinataires: resultat.coordination,
        sujet: `Désistement : ${activite.titre}`,
        texte:
          `${principal.nomAffiche} s’est désisté(e) de l’activité « ${activite.titre} » prévue le ${dateLisible(activite.debut)}.` +
          `${resultat.promu ? '\nLa première personne en liste d’attente a pris sa place.' : ''}\n\n${this.lien(id)}\n`,
      });
    }
    if (resultat.promu) {
      await this.notifier({
        destinataires: [resultat.promu],
        sujet: `Une place s’est libérée : ${activite.titre}`,
        texte: `Une place s’est libérée : vous êtes maintenant inscrit(e) à « ${activite.titre} », le ${dateLisible(activite.debut)}.\n\nVous pouvez vous désister depuis la plateforme si vous n’êtes plus disponible : ${this.lien(id)}\n`,
      });
    }
    return { id, organisationId: activite.organisationId };
  }

  /** Mes activités au format iCalendar, à importer dans mon agenda (M2-F06). */
  monAgenda(principal: PrincipalAssociation) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const inscriptions = await tx.inscription.findMany({
        where: { utilisateurId: principal.utilisateurId, statut: 'INSCRIT' },
        include: { activite: true },
      });
      const depuis = Date.now() - 30 * 86_400_000;
      return genererIcs(
        inscriptions
          .map((i) => i.activite)
          .filter((a) => a.debut.getTime() >= depuis)
          .map((a) => ({ id: a.id, titre: a.titre, lieu: a.lieu, description: a.description, debut: a.debut, fin: a.fin, annule: Boolean(a.annuleeLe) })),
      );
    });
  }

  // --- Tâches planifiées : rappels (M2-F04) et alertes (M2-R02) ---------------------------

  onApplicationBootstrap(): void {
    if (!this.config.TACHES_PLANIFIEES) return;
    this.minuterie = setInterval(() => {
      this.executerTaches().catch((e: unknown) => this.journal.error(`Tâches planifiées : ${(e as Error).message}`));
    }, INTERVALLE_TACHES_MS);
    this.minuterie.unref();
  }

  onApplicationShutdown(): void {
    if (this.minuterie) clearInterval(this.minuterie);
  }

  /**
   * Parcourt chaque association. Chaque envoi est d'abord « réservé » par une
   * mise à jour conditionnelle : même avec plusieurs instances de l'API, un
   * rappel n'est envoyé qu'une fois.
   */
  async executerTaches(maintenant = new Date()): Promise<{ rappels: number; alertes: number }> {
    const associations = await this.prisma.$queryRaw<{ tenant_id: string }[]>`SELECT * FROM app_associations()`;
    const bilan = { rappels: 0, alertes: 0 };
    const horizon = new Date(maintenant.getTime() + DELAI_ALERTE_SANS_INSCRIT_H * 3_600_000);

    for (const { tenant_id: tenantId } of associations) {
      const messages = await this.prisma.dansAssociation(tenantId, async (tx) => {
        const activites = await tx.activite.findMany({
          where: { debut: { gt: maintenant, lte: horizon }, annuleeLe: null },
          include: { inscriptions: { where: { statut: 'INSCRIT' } } },
        });
        const aEnvoyer: Message[] = [];
        for (const a of activites) {
          const etat = { ...a, inscrits: a.inscriptions.length };
          if (doitRecevoirRappel(etat, maintenant)) {
            const reserve = await tx.activite.updateMany({ where: { id: a.id, rappelEnvoyeLe: null }, data: { rappelEnvoyeLe: maintenant } });
            if (reserve.count === 1) {
              bilan.rappels += 1;
              aEnvoyer.push({
                destinataires: await this.adresses(tx, a.inscriptions.map((i) => i.utilisateurId)),
                sujet: `Rappel : ${a.titre}, ${dateLisible(a.debut)}`,
                texte: `Vous êtes inscrit(e) à « ${a.titre} », le ${dateLisible(a.debut)}${a.lieu ? `, ${a.lieu}` : ''}.\n\nEmpêché(e) ? Désistez-vous en un clic pour libérer votre place : ${this.lien(a.id)}\n`,
              });
            }
          }
          if (doitAlerterSansInscrit(etat, maintenant)) {
            const reserve = await tx.activite.updateMany({ where: { id: a.id, alerteSansInscritLe: null }, data: { alerteSansInscritLe: maintenant } });
            if (reserve.count === 1) {
              bilan.alertes += 1;
              aEnvoyer.push({
                destinataires: await this.adressesCoordination(tx, a.organisationId),
                sujet: `Aucun inscrit : ${a.titre}`,
                texte: `Personne n’est encore inscrit à « ${a.titre} », prévue le ${dateLisible(a.debut)}.\n\n${this.lien(a.id)}\n`,
              });
            }
          }
        }
        return aEnvoyer;
      });
      for (const message of messages) await this.notifier(message);
    }
    return bilan;
  }

  // --- Outils internes -----------------------------------------------------------------

  private async chargerActivite(tx: Tx, id: string) {
    const activite = await tx.activite.findUnique({ where: { id } });
    if (!activite) throw new NotFoundException('Activité introuvable.');
    return activite;
  }

  private async adresses(tx: Tx, utilisateurIds: string[]): Promise<string[]> {
    if (utilisateurIds.length === 0) return [];
    const lignes = await tx.utilisateur.findMany({
      where: { id: { in: utilisateurIds }, statut: 'ACTIF' },
      select: { email: true },
    });
    return lignes.map((l) => l.email);
  }

  private async adressesCoordination(tx: Tx, organisationId: string): Promise<string[]> {
    const organisation = await chargerOrganisation(tx, organisationId);
    const adhesions = await tx.adhesion.findMany({
      where: { organisationId: { in: ligneeDepuisChemin(organisation.chemin) }, role: { in: ROLES_COORDINATION } },
      select: { utilisateurId: true },
    });
    return [...new Set(await this.adresses(tx, adhesions.map((a) => a.utilisateurId)))];
  }

  private async notifier(message: Message): Promise<void> {
    try {
      await this.notificateur.envoyer(message);
    } catch (erreur) {
      this.journal.error(`Notification non envoyée (${message.sujet}) : ${(erreur as Error).message}`);
    }
  }

  private lien(activiteId: string): string {
    return `${this.config.URL_PUBLIQUE_WEB.replace(/\/$/, '')}/benevoles/activites/${activiteId}`;
  }
}

function dateLisible(d: Date): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(d);
}
