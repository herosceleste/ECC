/**
 * Ajoute des données de démonstration, entièrement fictives, à une association
 * existante : une antenne, deux groupes locaux, des logements, deux ménages,
 * un artisan, un entretien périodique, une activité et un parcours d'accueil ;
 * les modules M1, M2 et M3 sont activés.
 *
 * À n'utiliser que pour une découverte ou une formation, jamais sur une base
 * qui contient de vraies données. Connexion du propriétaire de la base :
 *
 *   DATABASE_URL=$DATABASE_URL_PROPRIETAIRE node dist/scripts/donnees-demo.js --slug snl-essonne
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { normaliserNom } from '../commun/normalisation';

async function principal(): Promise<void> {
  const { values } = parseArgs({ options: { slug: { type: 'string' } } });
  if (!values.slug) throw new Error('Usage : --slug <identifiant de l’association>');

  const prisma = new PrismaClient();
  try {
    const association = await prisma.organisation.findFirst({ where: { slug: values.slug, type: 'ASSOCIATION' } });
    if (!association) throw new Error(`Aucune association « ${values.slug} ».`);
    const t = { tenantId: association.id };
    if (await prisma.organisation.findFirst({ where: { ...t, slug: 'demo-antenne' } })) {
      throw new Error('Les données de démonstration sont déjà présentes.');
    }

    await prisma.$transaction(async (tx) => {
      const antenne = randomUUID();
      await tx.organisation.create({
        data: {
          ...t, id: antenne, parentId: association.id, type: 'ANTENNE',
          nom: 'Antenne de démonstration', slug: 'demo-antenne', chemin: `${association.chemin}${antenne}/`,
        },
      });
      const groupes: Record<string, string> = {};
      for (const [cle, nom] of [['nord', 'Groupe Nord (démo)'], ['sud', 'Groupe Sud (démo)']] as const) {
        const id = randomUUID();
        groupes[cle] = id;
        await tx.organisation.create({
          data: {
            ...t, id, parentId: antenne, type: 'GROUPE_LOCAL', nom, slug: `demo-${cle}`,
            chemin: `${association.chemin}${antenne}/${id}/`,
          },
        });
      }
      await tx.activationModule.createMany({
        data: [
          { ...t, organisationId: antenne, codeModule: 'M1', active: true },
          { ...t, organisationId: antenne, codeModule: 'M2', active: true },
          { ...t, organisationId: antenne, codeModule: 'M3', active: true },
        ],
      });

      const immeuble = await tx.immeuble.create({
        data: { ...t, organisationId: groupes.nord as string, ligneAdresse: '1 rue de l’Exemple', codePostal: '91000', commune: 'Villefictive', source: 'demo' },
      });
      const logements = [
        { organisationId: groupes.nord, immeubleId: immeuble.id, reference: 'DEMO-N1', typologie: 'T2', surfaceM2: 42, statut: 'OCCUPE' },
        { organisationId: groupes.nord, immeubleId: immeuble.id, reference: 'DEMO-N2', typologie: 'T3', surfaceM2: 61, statut: 'DISPONIBLE' },
        { organisationId: groupes.sud, reference: 'DEMO-S1', typologie: 'studio', surfaceM2: 24, statut: 'OCCUPE' },
        { organisationId: groupes.sud, reference: 'DEMO-S2', typologie: 'T4', surfaceM2: 78, statut: 'EN_TRAVAUX' },
      ] as const;
      const ids: string[] = [];
      for (const l of logements) {
        ids.push((await tx.logement.create({ data: { ...t, ...l, organisationId: l.organisationId as string, source: 'demo' } })).id);
      }

      for (const [groupe, libelle, membres] of [
        [groupes.nord, 'Famille Exemple (démo)', [['Exemple', 'Camille'], ['Exemple', 'Noé']]],
        [groupes.sud, 'Famille Fictive (démo)', [['Fictive', 'Alex']]],
      ] as const) {
        const menage = await tx.menage.create({ data: { ...t, organisationId: groupe as string, libelle, source: 'demo' } });
        for (const [nom, prenom] of membres) {
          await tx.personne.create({
            data: { ...t, organisationId: groupe as string, menageId: menage.id, nom, prenom, nomNormalise: normaliserNom(nom), source: 'demo' },
          });
        }
      }

      await tx.artisan.create({
        data: { ...t, organisationId: antenne, raisonSociale: 'Plomberie de démonstration', specialites: ['PLOMBERIE', 'CHAUFFAGE'], telephone: '01 00 00 00 00' },
      });
      await tx.entretienPeriodique.create({
        data: {
          ...t, organisationId: groupes.nord as string, logementId: ids[0] as string,
          libelle: 'Entretien annuel de la chaudière', categorie: 'CHAUFFAGE', periodiciteMois: 12,
          prochaineEcheance: new Date(Date.now() + 20 * 86_400_000),
        },
      });

      const administrateur = await tx.adhesion.findFirst({
        where: { organisationId: association.id, role: 'ADMINISTRATEUR' },
        select: { utilisateurId: true },
      });
      if (!administrateur) throw new Error('L’association n’a pas d’administrateur.');
      // Parcours d'accueil national de démonstration (M3), à remplacer par les vrais contenus de SNL.
      const contenus = [
        ['ETAPE', 'Découvrir SNL', 'L’histoire de l’association, ses valeurs et la façon dont un groupe local fonctionne.', 1],
        ['ETAPE', 'Lire la charte et l’engagement de confidentialité', 'Rendez-vous dans « Charte et engagements » pour les lire et les signer.', 2],
        ['ETAPE', 'Participer à une visite', 'Accompagnez un bénévole expérimenté lors d’une visite chez un ménage.', 3],
        ['FAQ', 'Comment signaler une fuite d’eau ?', 'Menu Travaux, puis « Signaler un problème ». Cochez « urgent » si l’eau coule.', 0],
        ['FAQ', 'Que faire si je ne peux plus venir à une activité ?', 'Désistez-vous depuis le planning : la personne suivante en liste d’attente prend votre place.', 0],
        ['CONTACT', 'Secrétariat de l’antenne (démo)', 'Du lundi au vendredi, 9 h – 17 h.\n01 00 00 00 00', 0],
      ] as const;
      for (const [type, titre, corps, ordre] of contenus) {
        await tx.contenuAccueil.create({
          data: { ...t, organisationId: association.id, type, titre, corps, ordre, creePar: administrateur.utilisateurId },
        });
      }

      const dansUneSemaine = new Date(Date.now() + 7 * 86_400_000);
      dansUneSemaine.setUTCHours(13, 0, 0, 0);
      await tx.activite.create({
        data: {
          ...t, organisationId: groupes.nord as string, type: 'CHANTIER', titre: 'Chantier peinture (démo)',
          lieu: '1 rue de l’Exemple, Villefictive', debut: dansUneSemaine,
          fin: new Date(dansUneSemaine.getTime() + 3 * 3_600_000), places: 4, creePar: administrateur.utilisateurId,
        },
      });
    });
    process.stdout.write('Données de démonstration ajoutées (antenne, 2 groupes, 4 logements, 2 ménages).\n');
  } finally {
    await prisma.$disconnect();
  }
}

principal().catch((erreur: unknown) => {
  process.stderr.write(`${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
  process.exit(1);
});
