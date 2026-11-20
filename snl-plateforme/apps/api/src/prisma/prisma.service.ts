import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Exécute `travail` dans une transaction où PostgreSQL ne laisse voir et
   * écrire que les lignes de l'association `tenantId` (politiques RLS).
   * Toute requête sur une table métier doit passer par ici.
   */
  async dansAssociation<T>(tenantId: string, travail: (tx: Tx) => Promise<T>): Promise<T> {
    if (!UUID.test(tenantId)) {
      throw new Error('Identifiant d’association invalide.');
    }
    return this.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      return travail(tx);
    }, { maxWait: 5_000, timeout: 15_000 });
  }
}
