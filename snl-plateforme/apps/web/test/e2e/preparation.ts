import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * Prépare une base de démonstration réaliste (fictive) avant les tests :
 * une association, une antenne, deux groupes locaux et cinq comptes.
 */
export default async function preparer(): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_PROPRIETAIRE } } });
  try {
    await prisma.$executeRawUnsafe(`
      TRUNCATE point_etape, parrainage, engagement_signe, progression_accueil, contenu_accueil,
               inscription, activite, referent, disponibilite, profil_benevole,
               evenement_intervention, ligne_cout, intervention, entretien_periodique, artisan,
               evenement_audit, document, donnees_sensibles, personne, menage, logement,
               immeuble, activation_module, adhesion, utilisateur, organisation RESTART IDENTITY CASCADE`);

    const asso = randomUUID();
    const antenne = randomUUID();
    const massy = randomUUID();
    const evry = randomUUID();
    const t = { tenantId: asso };
    await prisma.organisation.create({
      data: { ...t, id: asso, type: 'ASSOCIATION', nom: 'SNL Essonne (démo)', slug: 'snl-essonne', chemin: `/${asso}/` },
    });
    await prisma.organisation.create({
      data: { ...t, id: antenne, parentId: asso, type: 'ANTENNE', nom: 'Antenne Nord-Essonne', slug: 'nord', chemin: `/${asso}/${antenne}/` },
    });
    await prisma.organisation.create({
      data: { ...t, id: massy, parentId: antenne, type: 'GROUPE_LOCAL', nom: 'Groupe de Massy', slug: 'massy', chemin: `/${asso}/${antenne}/${massy}/` },
    });
    await prisma.organisation.create({
      data: { ...t, id: evry, parentId: antenne, type: 'GROUPE_LOCAL', nom: 'Groupe d’Évry', slug: 'evry', chemin: `/${asso}/${antenne}/${evry}/` },
    });

    // Groupe de Juvisy : seul le module M3 y est activé, pour tester l'accueil sans gêner les autres parcours.
    const juvisy = randomUUID();
    await prisma.organisation.create({
      data: { ...t, id: juvisy, parentId: antenne, type: 'GROUPE_LOCAL', nom: 'Groupe de Juvisy', slug: 'juvisy', chemin: `/${asso}/${antenne}/${juvisy}/` },
    });
    await prisma.activationModule.create({ data: { ...t, organisationId: juvisy, codeModule: 'M3', active: true } });
    await prisma.menage.create({ data: { ...t, organisationId: juvisy, libelle: 'Famille Juvisy (démo)' } });

    const membres: [string, string, string, 'ADMINISTRATEUR' | 'COORDINATEUR' | 'TRAVAILLEUR_SOCIAL' | 'BENEVOLE'][] = [
      ['admin', 'Camille Admin', asso, 'ADMINISTRATEUR'],
      ['coordo', 'Dominique Coordo', evry, 'COORDINATEUR'],
      ['ts', 'Sacha Travailleur', antenne, 'TRAVAILLEUR_SOCIAL'],
      ['benevole', 'Alex Bénévole', massy, 'BENEVOLE'],
      ['nouvelle', 'Nina Nouvelle', juvisy, 'BENEVOLE'],
      ['marraine', 'Maud Marraine', juvisy, 'BENEVOLE'],
    ];
    for (const [sujet, nom, organisationId, role] of membres) {
      const u = await prisma.utilisateur.create({
        data: { email: `${sujet}@exemple.org`, nomAffiche: nom, sujetIdentite: sujet, statut: 'ACTIF' },
      });
      await prisma.adhesion.create({ data: { ...t, utilisateurId: u.id, organisationId, role } });
    }

    // Modules M1 et M2 activés pour toute l'antenne.
    await prisma.activationModule.createMany({
      data: [
        { ...t, organisationId: antenne, codeModule: 'M1', active: true },
        { ...t, organisationId: antenne, codeModule: 'M2', active: true },
      ],
    });

    const immeuble = await prisma.immeuble.create({
      data: { ...t, organisationId: evry, ligneAdresse: '12 rue des Tilleuls', codePostal: '91000', commune: 'Évry-Courcouronnes' },
    });
    await prisma.logement.create({
      data: { ...t, organisationId: evry, immeubleId: immeuble.id, reference: 'EVR-001', typologie: 'T3', surfaceM2: 64.5, classeDpe: 'D', statut: 'OCCUPE' },
    });
    await prisma.logement.create({
      data: { ...t, organisationId: massy, reference: 'MAS-001', typologie: 'T2', surfaceM2: 41, statut: 'DISPONIBLE' },
    });
  } finally {
    await prisma.$disconnect();
  }
}
