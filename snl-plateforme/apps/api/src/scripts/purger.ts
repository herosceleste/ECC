/**
 * Purge définitive des personnes supprimées logiquement depuis plus de
 * 30 jours (règle M0-R02). À planifier une fois par jour, avec la connexion
 * du propriétaire de la base :
 *
 *   DATABASE_URL=$DATABASE_URL_PROPRIETAIRE node dist/scripts/purger.js
 *
 * Les données sensibles associées sont supprimées en cascade. Chaque purge
 * laisse une trace dans le journal d'audit de l'association concernée, sans
 * aucune donnée personnelle.
 */
import { PrismaClient } from '@prisma/client';
import { DELAI_PURGE_JOURS } from '../referentiel/personnes.service';

async function principal(): Promise<void> {
  const prisma = new PrismaClient();
  const limite = new Date(Date.now() - DELAI_PURGE_JOURS * 24 * 3600 * 1000);
  try {
    const aPurger = await prisma.personne.findMany({
      where: { supprimeLe: { lt: limite } },
      select: { id: true, tenantId: true, organisationId: true },
    });

    for (const personne of aPurger) {
      await prisma.$transaction([
        prisma.personne.delete({ where: { id: personne.id } }),
        prisma.evenementAudit.create({
          data: {
            tenantId: personne.tenantId,
            action: 'purger',
            entiteType: 'personne',
            entiteId: personne.id,
            organisationId: personne.organisationId,
            resultat: 'SUCCES',
            details: { regle: 'M0-R02', delaiJours: DELAI_PURGE_JOURS },
          },
        }),
      ]);
    }
    process.stdout.write(`${aPurger.length} fiche(s) purgée(s).\n`);
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((erreur: unknown) => {
  process.stderr.write(`${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
  process.exit(1);
});
