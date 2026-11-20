/**
 * Crée une association (organisation racine) et son premier administrateur.
 *
 * À exécuter avec la connexion du PROPRIÉTAIRE de la base (celle des
 * migrations), seule autorisée à créer une nouvelle association :
 *
 *   DATABASE_URL=$DATABASE_URL_PROPRIETAIRE node dist/scripts/creer-association.js \
 *     --nom "SNL Essonne" --slug snl-essonne \
 *     --admin-email admin@exemple.org --admin-nom "Camille Martin"
 *
 * L'administrateur reçoit le statut INVITE ; son compte Keycloak doit être créé
 * avec la même adresse (la première connexion rattache les deux).
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

async function principal(): Promise<void> {
  const { values } = parseArgs({
    options: {
      nom: { type: 'string' },
      slug: { type: 'string' },
      'admin-email': { type: 'string' },
      'admin-nom': { type: 'string' },
    },
  });
  const nom = values.nom?.trim();
  const slug = values.slug?.trim();
  const email = values['admin-email']?.trim().toLowerCase();
  const nomAdmin = values['admin-nom']?.trim();
  if (!nom || !slug || !email || !nomAdmin || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('Usage : --nom "…" --slug mon-association --admin-email … --admin-nom "…"');
  }

  const prisma = new PrismaClient();
  try {
    const id = randomUUID();
    const resultat = await prisma.$transaction(async (tx) => {
      const association = await tx.organisation.create({
        data: { id, tenantId: id, type: 'ASSOCIATION', nom, slug, chemin: `/${id}/` },
      });
      const utilisateur =
        (await tx.utilisateur.findUnique({ where: { email } })) ??
        (await tx.utilisateur.create({ data: { email, nomAffiche: nomAdmin, statut: 'INVITE' } }));
      await tx.adhesion.create({
        data: { tenantId: id, utilisateurId: utilisateur.id, organisationId: id, role: 'ADMINISTRATEUR' },
      });
      await tx.evenementAudit.create({
        data: {
          tenantId: id,
          action: 'creer-association',
          entiteType: 'organisation',
          entiteId: id,
          organisationId: id,
          resultat: 'SUCCES',
          details: { administrateur: utilisateur.id, outil: 'creer-association' },
        },
      });
      return { association, utilisateur };
    });
    process.stdout.write(
      `Association créée : ${resultat.association.nom} (${resultat.association.id})\n` +
        `Administrateur : ${resultat.utilisateur.email} (${resultat.utilisateur.statut})\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((erreur: unknown) => {
  process.stderr.write(`${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
  process.exit(1);
});
