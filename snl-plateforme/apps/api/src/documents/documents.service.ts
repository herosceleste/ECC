import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { Permission } from '@snl/shared';
import { createHash, randomUUID } from 'node:crypto';
import type { PrincipalAssociation } from '../auth/principal';
import { exigerSurOrganisation } from '../autorisation/acces';
import { AutorisationService } from '../autorisation/autorisation.service';
import { CONFIGURATION, type Configuration } from '../config/configuration';
import { PrismaService, type Tx } from '../prisma/prisma.service';
import { Antivirus } from './antivirus';
import { Stockage } from './stockage';
import { reconnaitreType } from './types-fichiers';

export const TYPES_ENTITES = ['organisation', 'immeuble', 'logement', 'menage', 'personne', 'intervention'] as const;
export type TypeEntite = (typeof TYPES_ENTITES)[number];

/** Permission de lecture qui donne accès aux documents d'une entité. */
const LECTURE_ENTITE: Record<TypeEntite, Permission> = {
  organisation: 'organisation:lire',
  immeuble: 'logement:lire',
  logement: 'logement:lire',
  menage: 'menage:lire',
  personne: 'personne:lire',
  intervention: 'travaux:lire',
};

/**
 * Permission d'écriture propre à certaines entités : les photos d'un
 * signalement peuvent être déposées par toute personne qui peut signaler,
 * bénévoles compris.
 */
const ECRITURE_ENTITE: Partial<Record<TypeEntite, Permission>> = {
  intervention: 'travaux:signaler',
};

export interface FichierRecu {
  originalname: string;
  buffer: Buffer;
  size: number;
}

export interface MetaDepot {
  entiteType: TypeEntite;
  entiteId: string;
  categorie: string;
}

const SELECTION_PUBLIQUE = {
  id: true,
  organisationId: true,
  entiteType: true,
  entiteId: true,
  categorie: true,
  nomFichier: true,
  typeMime: true,
  tailleOctets: true,
  version: true,
  creeLe: true,
} as const;

@Injectable()
export class DocumentsService {
  private readonly journal = new Logger('Documents');

  constructor(
    private readonly prisma: PrismaService,
    private readonly autorisation: AutorisationService,
    private readonly antivirus: Antivirus,
    private readonly stockage: Stockage,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  /**
   * Dépôt d'un document (M0-F05) : contrôle des droits, du type réel et de la
   * taille, analyse antivirus, puis stockage. Un fichier infecté n'est jamais
   * écrit dans le stockage.
   */
  async deposer(principal: PrincipalAssociation, meta: MetaDepot, fichier: FichierRecu | undefined) {
    if (!fichier || fichier.size === 0) throw new BadRequestException('Aucun fichier reçu.');
    if (fichier.size > this.config.TAILLE_MAX_DOCUMENT_OCTETS) {
      throw new PayloadTooLargeException('Le fichier dépasse la taille autorisée.');
    }

    const { organisationId, version } = await this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const orgId = await this.exigerSurEntite(tx, principal, meta, 'document:ecrire');
      const precedente = await tx.document.findFirst({
        where: {
          entiteType: meta.entiteType,
          entiteId: meta.entiteId,
          categorie: meta.categorie,
          nomFichier: fichier.originalname,
        },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      return { organisationId: orgId, version: (precedente?.version ?? 0) + 1 };
    });

    const typeMime = reconnaitreType(fichier.originalname, fichier.buffer);
    if (!typeMime) {
      throw new UnprocessableEntityException(
        'Ce type de fichier n’est pas accepté. Formats possibles : PDF, JPEG, PNG, WebP, DOCX, XLSX, ODT, ODS.',
      );
    }

    let analyse;
    try {
      analyse = await this.antivirus.analyser(fichier.buffer);
    } catch (erreur) {
      this.journal.error(`Analyse antivirus impossible : ${(erreur as Error).message}`);
      throw new ServiceUnavailableException('Le contrôle antivirus est indisponible. Réessayez plus tard.');
    }
    if (!analyse.sain) {
      this.journal.warn(`Fichier infecté refusé (${analyse.signature}).`);
      throw new UnprocessableEntityException(
        'Ce fichier contient un élément dangereux et a été refusé. Il n’a pas été enregistré.',
      );
    }

    const empreinte = createHash('sha256').update(fichier.buffer).digest('hex');
    const id = randomUUID();
    const cleStockage = `${principal.tenantId}/${meta.entiteType}/${id}`;
    await this.stockage.deposer(cleStockage, fichier.buffer, typeMime, empreinte);

    return this.prisma.dansAssociation(principal.tenantId, (tx) =>
      tx.document.create({
        data: {
          id,
          tenantId: principal.tenantId,
          organisationId,
          entiteType: meta.entiteType,
          entiteId: meta.entiteId,
          categorie: meta.categorie,
          nomFichier: fichier.originalname,
          typeMime,
          tailleOctets: fichier.size,
          empreinteSha256: empreinte,
          cleStockage,
          version,
          statutAnalyse: 'SAIN',
          deposePar: principal.utilisateurId,
        },
        select: SELECTION_PUBLIQUE,
      }),
    );
  }

  lister(principal: PrincipalAssociation, entiteType: TypeEntite, entiteId: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      await this.exigerSurEntite(tx, principal, { entiteType, entiteId }, 'document:lire');
      return tx.document.findMany({
        where: { entiteType, entiteId, supprimeLe: null },
        select: SELECTION_PUBLIQUE,
        orderBy: [{ categorie: 'asc' }, { creeLe: 'desc' }],
      });
    });
  }

  /** Lien de téléchargement valable quelques minutes ; chaque demande est auditée. */
  lien(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const document = await tx.document.findFirst({ where: { id, supprimeLe: null } });
      if (!document || document.statutAnalyse !== 'SAIN') throw new NotFoundException('Document introuvable.');
      await this.exigerSurEntite(
        tx, principal, { entiteType: document.entiteType as TypeEntite, entiteId: document.entiteId }, 'document:lire',
      );
      const duree = this.config.DUREE_LIEN_DOCUMENT_SECONDES;
      const url = await this.stockage.lienTemporaire(document.cleStockage, document.nomFichier, duree);
      return { id, organisationId: document.organisationId, url, expireDansSecondes: duree };
    });
  }

  supprimer(principal: PrincipalAssociation, id: string) {
    return this.prisma.dansAssociation(principal.tenantId, async (tx) => {
      const document = await tx.document.findFirst({ where: { id, supprimeLe: null } });
      if (!document) throw new NotFoundException('Document introuvable.');
      await this.exigerSurEntite(
        tx, principal, { entiteType: document.entiteType as TypeEntite, entiteId: document.entiteId }, 'document:ecrire',
      );
      await tx.document.update({ where: { id }, data: { supprimeLe: new Date() } });
      return { id, organisationId: document.organisationId };
    });
  }

  /** Vérifie que l'entité existe et que le principal a la permission sur son organisation. */
  private async exigerSurEntite(
    tx: Tx,
    principal: PrincipalAssociation,
    entite: { entiteType: TypeEntite; entiteId: string },
    permission: 'document:lire' | 'document:ecrire',
  ): Promise<string> {
    const organisationId = await organisationDeLEntite(tx, entite.entiteType, entite.entiteId);
    if (!organisationId) throw new NotFoundException('Élément introuvable.');
    const lecture = LECTURE_ENTITE[entite.entiteType];
    const effective =
      permission === 'document:lire' ? lecture : (ECRITURE_ENTITE[entite.entiteType] ?? permission);
    await exigerSurOrganisation(tx, this.autorisation, principal, lecture, organisationId, lecture, 'Élément');
    await exigerSurOrganisation(tx, this.autorisation, principal, effective, organisationId, lecture, 'Élément');
    return organisationId;
  }
}

async function organisationDeLEntite(tx: Tx, type: TypeEntite, id: string): Promise<string | null> {
  const choisir = { select: { organisationId: true } } as const;
  switch (type) {
    case 'organisation':
      return (await tx.organisation.findUnique({ where: { id }, select: { id: true } }))?.id ?? null;
    case 'immeuble':
      return (await tx.immeuble.findUnique({ where: { id }, ...choisir }))?.organisationId ?? null;
    case 'logement':
      return (await tx.logement.findUnique({ where: { id }, ...choisir }))?.organisationId ?? null;
    case 'menage':
      return (await tx.menage.findFirst({ where: { id, supprimeLe: null }, ...choisir }))?.organisationId ?? null;
    case 'personne':
      return (await tx.personne.findFirst({ where: { id, supprimeLe: null }, ...choisir }))?.organisationId ?? null;
    case 'intervention':
      return (await tx.intervention.findUnique({ where: { id }, ...choisir }))?.organisationId ?? null;
  }
}
