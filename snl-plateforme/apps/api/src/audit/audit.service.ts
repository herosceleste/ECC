import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, ResultatAudit } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface EvenementAAuditer {
  tenantId: string;
  utilisateurId?: string;
  action: string;
  entiteType: string;
  entiteId?: string;
  organisationId?: string;
  resultat: ResultatAudit;
  adresseIp?: string;
  details?: Prisma.InputJsonValue;
}

/**
 * Journal d'audit (exigence T-05, fonction M0-F06).
 *
 * Chaque événement est écrit dans sa propre transaction : un refus d'accès est
 * ainsi tracé même quand l'opération demandée échoue.
 */
@Injectable()
export class AuditService {
  private readonly journal = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async enregistrer(evenement: EvenementAAuditer): Promise<void> {
    try {
      await this.prisma.dansAssociation(evenement.tenantId, (tx) =>
        tx.evenementAudit.create({ data: evenement }),
      );
    } catch (erreur) {
      // Une panne d'audit ne doit jamais passer inaperçue : on la journalise
      // en erreur pour qu'elle déclenche une alerte de supervision.
      this.journal.error(
        `Échec d'écriture d'un événement d'audit (${evenement.action} ${evenement.entiteType}) : ${
          (erreur as Error).message
        }`,
      );
      throw erreur;
    }
  }
}
