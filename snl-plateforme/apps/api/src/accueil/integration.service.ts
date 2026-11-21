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
import type { ContenuAccueil, TypeContenuAccueil } from '@prisma/client';
import type { Role } from '@snl/shared';
import type { PrincipalAssociation } from '../auth/principal';
import { exigerSurOrganisation } from '../autorisation/acces';
import { AutorisationService } from '../autorisation/autorisation.service';
import { CONFIGURATION, type Configuration } from '../config/configuration';
import { ConfidentialiteService, type TypeEngagement } from '../confidentialite/confidentialite.service';
import { ligneeDepuisChemin, ModulesService } from '../modules-plateforme/modules.service';
import { Notificateur, type Message } from '../notifications/notificateur';
import { chargerOrganisation, idsOrganisationsDuPerimetre } from '../organisations/organisations.service';
import { PrismaService, type Tx } from '../prisma/prisma.service';

export const DELAI_RELANCE_JOURS = 30;
const ROLES_EQUIPE: Role[] = ['BENEVOLE', 'COORDINATEUR', 'GESTIONNAIRE', 'TRAVAILLEUR_SOCIAL'];
const ENGAGEMENTS: TypeEngagement[] = ['ENGAGEMENT_CONFIDENTIALITE', 'ENGAGEMENT_CHARTE'];
const INTERVALLE_TACHES_MS = 60 * 60 * 1000;

export interface DonneesContenu {
  organisationId: string;
  type: TypeContenuAccueil;
  titre: string;
  corps: string;
  lienVideo?: string | null;
  ordre?: number;
  publie?: boolean;
}

/**
 * Module M3 : parcours d'intégration (M3-F01), contenus (M3-F02), contacts
 * (M3-F03), parrainage (M3-F04), foire aux questions (M3-F05) et engagements
 * (M3-F06). Les contenus d'une organisation valent pour toutes celles qui en
 * dépendent ; seuls ses propres éditeurs peuvent les modifier (M3-R02).
 */
@Injectable()
export class IntegrationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly journal = new Logger('Integration');
  private minuterie: NodeJS.Timeout | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
    private readonly modules: ModulesService,
    private readonly confidentialite: ConfidentialiteService,
    private readonly notificateur: Notificateur,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  // --- Contenus ------------------------------------------------------------------------

  contenus(principal: PrincipalAssociation, type?: TypeContenuAccueil) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const visibles = await this.organisationsVisibles(tx, principal.utilisateurId, principal);
      const organisations = await tx.organisation.findMany({
        where: { id: { in: visibles } },
        select: { id: true, nom: true, chemin: true },
      });
      const contenus = await tx.contenuAccueil.findMany({
        where: {
          organisationId: { in: visibles },
          type,
          OR: [{ publie: true }, ...this.editables(principal, organisations).map((id) => ({ organisationId: id }))],
        },
      });
      return trierContenus(contenus, organisations).map((c) => {
        const org = organisations.find((o) => o.id === c.organisationId);
        return {
          ...c,
          portee: org?.nom ?? '',
          national: c.organisationId === principal.tenantId,
          modifiable: org ? this.autorisation.peut(principal, 'accueil:editer', org.chemin) : false,
        };
      });
    });
  }

  creerContenu(principal: PrincipalAssociation, donnees: DonneesContenu) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exigerEdition(tx, principal, donnees.organisationId);
      this.verifierPortee(principal, donnees.type, donnees.organisationId);
      return tx.contenuAccueil.create({ data: { ...donnees, tenantId: principal.tenantId, creePar: principal.utilisateurId } });
    });
  }

  modifierContenu(principal: PrincipalAssociation, id: string, donnees: Partial<Omit<DonneesContenu, 'organisationId' | 'type'>>) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const contenu = await this.chargerContenu(tx, id);
      await this.exigerEdition(tx, principal, contenu.organisationId);
      return tx.contenuAccueil.update({ where: { id }, data: donnees });
    });
  }

  supprimerContenu(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const contenu = await this.chargerContenu(tx, id);
      await this.exigerEdition(tx, principal, contenu.organisationId);
      await tx.contenuAccueil.delete({ where: { id } });
      return { id, organisationId: contenu.organisationId };
    });
  }

  /** Recherche plein texte en français dans la foire aux questions (M3-F05). */
  rechercherFaq(principal: PrincipalAssociation, q: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const visibles = await this.organisationsVisibles(tx, principal.utilisateurId, principal);
      if (visibles.length === 0) return [];
      const resultats = await tx.$queryRaw<{ id: string; titre: string; corps: string }[]>`
        SELECT id, titre, corps
        FROM contenu_accueil
        WHERE type = 'FAQ' AND publie
          AND organisation_id = ANY(${visibles}::uuid[])
          AND to_tsvector('french', titre || ' ' || corps) @@ plainto_tsquery('french', ${q})
        ORDER BY ts_rank(to_tsvector('french', titre || ' ' || corps), plainto_tsquery('french', ${q})) DESC
        LIMIT 20`;
      if (resultats.length > 0) return resultats;
      // Repli pour les mots que le dictionnaire français ne reconnaît pas (sigles, noms propres).
      return tx.contenuAccueil.findMany({
        where: {
          type: 'FAQ',
          publie: true,
          organisationId: { in: visibles },
          OR: [{ titre: { contains: q, mode: 'insensitive' } }, { corps: { contains: q, mode: 'insensitive' } }],
        },
        select: { id: true, titre: true, corps: true },
        take: 20,
      });
    });
  }

  // --- Mon parcours (M3-F01) ----------------------------------------------------------------

  monParcours(principal: PrincipalAssociation) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const visibles = await this.organisationsVisibles(tx, principal.utilisateurId, principal);
      const actif = visibles.length > 0;
      const organisations = await tx.organisation.findMany({ where: { id: { in: visibles } }, select: { id: true, nom: true, chemin: true } });
      const etapes = trierContenus(
        await tx.contenuAccueil.findMany({ where: { organisationId: { in: visibles }, type: 'ETAPE', publie: true } }),
        organisations,
      );
      const progressions = await tx.progressionAccueil.findMany({ where: { utilisateurId: principal.utilisateurId } });
      const parrainage = await tx.parrainage.findUnique({
        where: { tenantId_filleulId: { tenantId: principal.tenantId, filleulId: principal.utilisateurId } },
        include: { points: { orderBy: { date: 'asc' } } },
      });
      const parrain = parrainage
        ? await tx.utilisateur.findUnique({ where: { id: parrainage.parrainId }, select: { nomAffiche: true, email: true } })
        : null;
      const engagements = await Promise.all(
        ENGAGEMENTS.map(async (type) => ({
          type,
          titre: (await this.confidentialite.texteCourant(tx, principal.tenantId, type)).titre,
          signe: await this.confidentialite.aSigne(tx, principal.tenantId, principal.utilisateurId, type),
        })),
      );
      const terminees = new Set(progressions.map((p) => p.contenuId));
      // Les personnes que j'accompagne comme parrain ou marraine, et leur avancement.
      const mesFilleuls = await tx.parrainage.findMany({
        where: { parrainId: principal.utilisateurId },
        include: { points: { orderBy: { date: 'asc' } } },
      });
      const filleuls = await Promise.all(
        mesFilleuls.map(async (f) => {
          const etapesFilleul = await this.etapesVisibles(tx, f.filleulId);
          const [utilisateur, faites] = await Promise.all([
            tx.utilisateur.findUnique({ where: { id: f.filleulId }, select: { nomAffiche: true, email: true } }),
            tx.progressionAccueil.count({ where: { utilisateurId: f.filleulId, contenuId: { in: etapesFilleul } } }),
          ]);
          return {
            parrainageId: f.id,
            nomAffiche: utilisateur?.nomAffiche ?? '—',
            email: utilisateur?.email ?? null,
            etapesTerminees: faites,
            etapesTotal: etapesFilleul.length,
            points: f.points,
          };
        }),
      );
      return {
        filleuls,
        actif,
        etapes: etapes.map((e) => ({ ...e, terminee: terminees.has(e.id) })),
        nombreTerminees: etapes.filter((e) => terminees.has(e.id)).length,
        complet: etapes.length > 0 && etapes.every((e) => terminees.has(e.id)),
        parrain: parrain && parrainage ? { ...parrain, points: parrainage.points } : null,
        engagements,
      };
    });
  }

  terminerEtape(principal: PrincipalAssociation, contenuId: string, terminee: boolean) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const contenu = await this.chargerContenu(tx, contenuId);
      const visibles = await this.organisationsVisibles(tx, principal.utilisateurId, principal);
      if (contenu.type !== 'ETAPE' || !visibles.includes(contenu.organisationId)) throw new NotFoundException('Étape introuvable.');
      if (terminee) {
        await tx.progressionAccueil.upsert({
          where: { utilisateurId_contenuId: { utilisateurId: principal.utilisateurId, contenuId } },
          create: { tenantId: principal.tenantId, utilisateurId: principal.utilisateurId, contenuId },
          update: {},
        });
      } else {
        await tx.progressionAccueil.deleteMany({ where: { utilisateurId: principal.utilisateurId, contenuId } });
      }
      return { id: contenuId, terminee };
    });
  }

  // --- Engagements (M3-F06, M3-R01) ----------------------------------------------------------

  engagements(principal: PrincipalAssociation) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) =>
      Promise.all(
        ENGAGEMENTS.map(async (type) => ({
          ...(await this.confidentialite.texteCourant(tx, principal.tenantId, type)),
          signe: await this.confidentialite.aSigne(tx, principal.tenantId, principal.utilisateurId, type),
        })),
      ),
    );
  }

  /**
   * Enregistre la signature du texte en vigueur. L'empreinte envoyée par
   * l'interface doit être celle du texte affiché : on ne signe jamais un
   * texte qui aurait changé entre-temps.
   */
  signer(principal: PrincipalAssociation, type: TypeEngagement, empreinteLue: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const texte = await this.confidentialite.texteCourant(tx, principal.tenantId, type);
      if (texte.empreinte !== empreinteLue) {
        throw new ConflictException('Le texte a été modifié entre-temps : relisez-le avant de signer.');
      }
      const existante = await tx.engagementSigne.findFirst({ where: { utilisateurId: principal.utilisateurId, type, empreinte: texte.empreinte } });
      return (
        existante ??
        tx.engagementSigne.create({
          data: { tenantId: principal.tenantId, utilisateurId: principal.utilisateurId, type, empreinte: texte.empreinte },
        })
      );
    });
  }

  // --- Parrainage (M3-F04) ----------------------------------------------------------------

  /** Nouveaux membres de l'équipe et leur avancement, pour qui organise l'accueil. */
  suivi(principal: PrincipalAssociation) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const ids = await this.modules.organisationsAvecModule(
        tx,
        await idsOrganisationsDuPerimetre(tx, this.autorisation.perimetre(principal, 'accueil:editer')),
        'M3',
      );
      const adhesions = await tx.adhesion.findMany({
        where: { organisationId: { in: ids }, role: 'BENEVOLE' },
        include: { utilisateur: { select: { id: true, nomAffiche: true, statut: true } }, organisation: { select: { id: true, nom: true } } },
        orderBy: { creeLe: 'desc' },
      });
      const parrainages = await tx.parrainage.findMany({ include: { points: { orderBy: { date: 'asc' } } } });
      const progressions = await tx.progressionAccueil.findMany({ where: { utilisateurId: { in: adhesions.map((a) => a.utilisateurId) } } });
      const noms = new Map(
        (await tx.utilisateur.findMany({ where: { id: { in: parrainages.map((p) => p.parrainId) } }, select: { id: true, nomAffiche: true } })).map(
          (u) => [u.id, u.nomAffiche],
        ),
      );
      const vus = new Set<string>();
      const lignes = [];
      for (const a of adhesions) {
        if (vus.has(a.utilisateurId) || a.utilisateur.statut === 'SUSPENDU') continue;
        vus.add(a.utilisateurId);
        const etapes = await this.etapesVisibles(tx, a.utilisateurId);
        const faites = progressions.filter((p) => p.utilisateurId === a.utilisateurId && etapes.includes(p.contenuId)).length;
        const parrainage = parrainages.find((p) => p.filleulId === a.utilisateurId);
        lignes.push({
          utilisateurId: a.utilisateurId,
          nomAffiche: a.utilisateur.nomAffiche,
          organisation: a.organisation,
          arriveeLe: a.creeLe,
          etapesTerminees: faites,
          etapesTotal: etapes.length,
          parrainage: parrainage ? { ...parrainage, parrainNom: noms.get(parrainage.parrainId) ?? '—' } : null,
        });
      }
      return lignes;
    });
  }

  async designerParrain(principal: PrincipalAssociation, donnees: { organisationId: string; filleulId: string; parrainId: string }) {
    if (donnees.filleulId === donnees.parrainId) throw new BadRequestException('Une personne ne peut pas être sa propre marraine ou son propre parrain.');
    const { parrainage, message } = await this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exigerEdition(tx, principal, donnees.organisationId);
      const organisation = await chargerOrganisation(tx, donnees.organisationId);
      const lignee = ligneeDepuisChemin(organisation.chemin);
      const membres = await tx.adhesion.findMany({
        where: { utilisateurId: { in: [donnees.filleulId, donnees.parrainId] }, organisationId: { in: lignee }, role: { in: ROLES_EQUIPE } },
        include: { utilisateur: { select: { email: true, nomAffiche: true } } },
      });
      const filleul = membres.find((m) => m.utilisateurId === donnees.filleulId);
      const parrain = membres.find((m) => m.utilisateurId === donnees.parrainId);
      if (!filleul || !parrain) throw new NotFoundException('Les deux personnes doivent faire partie de l’équipe de cette organisation.');
      const parrainage = await tx.parrainage.upsert({
        where: { tenantId_filleulId: { tenantId: principal.tenantId, filleulId: donnees.filleulId } },
        create: { ...donnees, tenantId: principal.tenantId, creePar: principal.utilisateurId },
        update: { parrainId: donnees.parrainId, organisationId: donnees.organisationId, relanceEnvoyeeLe: null },
      });
      return {
        parrainage,
        message: {
          destinataires: [parrain.utilisateur.email],
          sujet: `Vous accompagnez ${filleul.utilisateur.nomAffiche}`,
          texte: `Bonjour ${parrain.utilisateur.nomAffiche},\n\nVous êtes désormais le parrain ou la marraine de ${filleul.utilisateur.nomAffiche}, qui rejoint l’équipe. Prenez contact dans les prochains jours et convenez ensemble d’un premier point d’étape.\n\n${this.lien('/integration/suivi')}\n`,
        } satisfies Message,
      };
    });
    await this.notifier(message);
    return parrainage;
  }

  ajouterPoint(principal: PrincipalAssociation, parrainageId: string, date: Date) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const parrainage = await this.chargerParrainage(tx, parrainageId);
      await this.exigerParrainOuEditeur(tx, principal, parrainage);
      return tx.pointEtape.create({ data: { tenantId: principal.tenantId, parrainageId, date } });
    });
  }

  marquerPointFait(principal: PrincipalAssociation, pointId: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const point = await tx.pointEtape.findUnique({ where: { id: pointId } });
      if (!point) throw new NotFoundException('Point d’étape introuvable.');
      await this.exigerParrainOuEditeur(tx, principal, await this.chargerParrainage(tx, point.parrainageId));
      return tx.pointEtape.update({ where: { id: pointId }, data: { faitLe: new Date() } });
    });
  }

  // --- Relance du parrain (critère M3-3) ---------------------------------------------------

  onApplicationBootstrap(): void {
    if (!this.config.TACHES_PLANIFIEES) return;
    this.minuterie = setInterval(() => {
      this.executerTaches().catch((e: unknown) => this.journal.error(`Relances : ${(e as Error).message}`));
    }, INTERVALLE_TACHES_MS);
    this.minuterie.unref();
  }

  onApplicationShutdown(): void {
    if (this.minuterie) clearInterval(this.minuterie);
  }

  /** Relance le parrain d'un parcours inachevé 30 jours après le début, une seule fois. */
  async executerTaches(maintenant = new Date()): Promise<{ relances: number }> {
    const associations = await this.prisma.$queryRaw<{ tenant_id: string }[]>`SELECT * FROM app_associations()`;
    const limite = new Date(maintenant.getTime() - DELAI_RELANCE_JOURS * 86_400_000);
    let relances = 0;
    for (const { tenant_id: tenantId } of associations) {
      const messages = await this.prisma.dansAssociation(tenantId, async (tx) => {
        const parrainages = await tx.parrainage.findMany({ where: { relanceEnvoyeeLe: null, debut: { lt: limite } } });
        const aEnvoyer: Message[] = [];
        for (const p of parrainages) {
          const etapes = await this.etapesVisibles(tx, p.filleulId);
          const faites = await tx.progressionAccueil.count({ where: { utilisateurId: p.filleulId, contenuId: { in: etapes } } });
          if (etapes.length === 0 || faites >= etapes.length) continue;
          const reserve = await tx.parrainage.updateMany({ where: { id: p.id, relanceEnvoyeeLe: null }, data: { relanceEnvoyeeLe: maintenant } });
          if (reserve.count !== 1) continue;
          const [parrain, filleul] = await Promise.all([
            tx.utilisateur.findUnique({ where: { id: p.parrainId }, select: { email: true, nomAffiche: true, statut: true } }),
            tx.utilisateur.findUnique({ where: { id: p.filleulId }, select: { nomAffiche: true } }),
          ]);
          if (!parrain || parrain.statut !== 'ACTIF') continue;
          relances += 1;
          aEnvoyer.push({
            destinataires: [parrain.email],
            sujet: `Nouvelles de ${filleul?.nomAffiche ?? 'votre filleul'} ?`,
            texte: `Bonjour ${parrain.nomAffiche},\n\nLe parcours d’accueil de ${filleul?.nomAffiche ?? 'la personne que vous accompagnez'} est commencé depuis plus de ${DELAI_RELANCE_JOURS} jours et n’est pas terminé (${faites} étape(s) sur ${etapes.length}). Un petit appel pour faire le point ?\n\n${this.lien('/integration/suivi')}\n`,
          });
        }
        return aEnvoyer;
      });
      for (const m of messages) await this.notifier(m);
    }
    return { relances };
  }

  // --- Outils internes -------------------------------------------------------------------

  /**
   * Organisations dont les contenus concernent une personne : ses
   * organisations où M3 est activé et toutes leurs parentes ; pour qui
   * édite, aussi les organisations de son périmètre.
   */
  private async organisationsVisibles(tx: Tx, utilisateurId: string, principal?: PrincipalAssociation): Promise<string[]> {
    const adhesions = await tx.adhesion.findMany({ where: { utilisateurId }, include: { organisation: { select: { id: true, chemin: true } } } });
    const actives = new Set(await this.modules.organisationsAvecModule(tx, adhesions.map((a) => a.organisationId), 'M3'));
    const ids = new Set<string>();
    for (const a of adhesions) {
      if (actives.has(a.organisationId)) ligneeDepuisChemin(a.organisation.chemin).forEach((id) => ids.add(id));
    }
    if (principal) {
      // Qui édite voit aussi les groupes de son périmètre où M3 est activé, et
      // leurs organisations parentes, dont les contenus s'appliquent à ces groupes.
      const descendants = await this.modules.organisationsAvecModule(
        tx,
        await idsOrganisationsDuPerimetre(tx, this.autorisation.perimetre(principal, 'accueil:editer')),
        'M3',
      );
      const chemins = await tx.organisation.findMany({ where: { id: { in: descendants } }, select: { chemin: true } });
      chemins.forEach((o) => ligneeDepuisChemin(o.chemin).forEach((id) => ids.add(id)));
    }
    return [...ids];
  }

  private async etapesVisibles(tx: Tx, utilisateurId: string): Promise<string[]> {
    const visibles = await this.organisationsVisibles(tx, utilisateurId);
    const etapes = await tx.contenuAccueil.findMany({
      where: { organisationId: { in: visibles }, type: 'ETAPE', publie: true },
      select: { id: true },
    });
    return etapes.map((e) => e.id);
  }

  private editables(principal: PrincipalAssociation, organisations: { id: string; chemin: string }[]): string[] {
    return organisations.filter((o) => this.autorisation.peut(principal, 'accueil:editer', o.chemin)).map((o) => o.id);
  }

  private async exigerEdition(tx: Tx, principal: PrincipalAssociation, organisationId: string) {
    await exigerSurOrganisation(tx, this.autorisation, principal, 'accueil:editer', organisationId, 'accueil:lire', 'Organisation');
  }

  /** Les engagements sont nationaux : ils ne se rédigent qu'au niveau de l'association. */
  private verifierPortee(principal: PrincipalAssociation, type: TypeContenuAccueil, organisationId: string) {
    if (ENGAGEMENTS.includes(type as TypeEngagement) && organisationId !== principal.tenantId) {
      throw new BadRequestException('La charte et l’engagement de confidentialité se rédigent au niveau de l’association.');
    }
  }

  private async exigerParrainOuEditeur(tx: Tx, principal: PrincipalAssociation, parrainage: { parrainId: string; organisationId: string }) {
    if (parrainage.parrainId === principal.utilisateurId) return;
    await this.exigerEdition(tx, principal, parrainage.organisationId);
  }

  private async chargerContenu(tx: Tx, id: string): Promise<ContenuAccueil> {
    const contenu = await tx.contenuAccueil.findUnique({ where: { id } });
    if (!contenu) throw new NotFoundException('Contenu introuvable.');
    return contenu;
  }

  private async chargerParrainage(tx: Tx, id: string) {
    const parrainage = await tx.parrainage.findUnique({ where: { id } });
    if (!parrainage) throw new NotFoundException('Parrainage introuvable.');
    return parrainage;
  }

  private async notifier(message: Message) {
    try {
      await this.notificateur.envoyer(message);
    } catch (erreur) {
      this.journal.error(`Notification non envoyée (${message.sujet}) : ${(erreur as Error).message}`);
    }
  }

  private lien(chemin: string): string {
    return `${this.config.URL_PUBLIQUE_WEB.replace(/\/$/, '')}${chemin}`;
  }
}

/** Du plus général au plus local (association, antenne, groupe), puis selon l'ordre choisi. */
export function trierContenus<T extends { organisationId: string; ordre: number; titre: string }>(
  contenus: T[],
  organisations: { id: string; chemin: string }[],
): T[] {
  const profondeur = (id: string) => organisations.find((o) => o.id === id)?.chemin.length ?? 0;
  return [...contenus].sort(
    (a, b) => profondeur(a.organisationId) - profondeur(b.organisationId) || a.ordre - b.ordre || a.titre.localeCompare(b.titre, 'fr'),
  );
}
