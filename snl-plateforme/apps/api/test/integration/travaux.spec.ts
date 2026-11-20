import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import {
  clientProprietaire,
  creerArbre,
  creerMembre,
  decrireAvecBase,
  demarrerApplication,
  jeton,
  URL_APPLICATION,
  viderBase,
  type ApplicationDeTest,
  type Arbre,
} from './outils';

/**
 * Module M1 Travaux et entretien, de bout en bout côté API.
 * Les numéros renvoient aux critères et règles du cahier des charges.
 */
decrireAvecBase('Module M1 Travaux et entretien', () => {
  const proprietaire = clientProprietaire();
  let contexte: ApplicationDeTest;
  let app: INestApplication;
  let a: Arbre;
  let b: Arbre;
  let logementG1: string;
  let logementG2: string;

  const api = (sujet: string, tenantId: string = a.association) => {
    const http = request(app.getHttpServer());
    const avec = (r: request.Test) => r.set('Authorization', jeton(sujet)).set('X-Association', tenantId);
    return {
      get: (url: string) => avec(http.get(`/api/v1${url}`)),
      post: (url: string) => avec(http.post(`/api/v1${url}`)),
      patch: (url: string) => avec(http.patch(`/api/v1${url}`)),
    };
  };

  const signaler = (sujet: string, corps: Record<string, unknown>) =>
    api(sujet).post('/travaux/interventions').send({ logementId: logementG2, ...corps });

  beforeAll(async () => {
    await viderBase(proprietaire);
    a = await creerArbre(proprietaire, 'trav-a');
    b = await creerArbre(proprietaire, 'trav-b');
    await creerMembre(proprietaire, a.association, a.antenne, 'GESTIONNAIRE', 'gestion');
    await creerMembre(proprietaire, a.association, a.groupe2, 'COORDINATEUR', 'coordo2');
    await creerMembre(proprietaire, a.association, a.groupe2, 'BENEVOLE', 'benevole2');
    await creerMembre(proprietaire, a.association, a.groupe1, 'BENEVOLE', 'benevole1');
    await creerMembre(proprietaire, b.association, b.association, 'ADMINISTRATEUR', 'admin-autre');

    const base = { tenantId: a.association, typologie: 'T3' };
    logementG1 = (await proprietaire.logement.create({ data: { ...base, organisationId: a.groupe1, reference: 'G1-01' } })).id;
    logementG2 = (await proprietaire.logement.create({ data: { ...base, organisationId: a.groupe2, reference: 'G2-01' } })).id;

    // M1 activé pour toute l'antenne, puis retiré au seul groupe 1.
    await proprietaire.activationModule.createMany({
      data: [
        { tenantId: a.association, organisationId: a.antenne, codeModule: 'M1', active: true },
        { tenantId: a.association, organisationId: a.groupe1, codeModule: 'M1', active: false },
      ],
    });

    contexte = await demarrerApplication();
    app = contexte.app;
  });

  afterAll(async () => {
    await app?.close();
    await proprietaire.$disconnect();
  });

  it('refuse tout signalement là où le module n’est pas activé', async () => {
    const reponse = await api('benevole1')
      .post('/travaux/interventions')
      .send({ logementId: logementG1, categorie: 'PLOMBERIE', description: 'Le robinet de la cuisine goutte.' })
      .expect(403);
    expect(reponse.body.message).toMatch(/n’est pas activé/);
  });

  it('critère M1-1 : un signalement avec photos arrive chez le gestionnaire', async () => {
    const cree = await signaler('benevole2', {
      categorie: 'HUMIDITE',
      description: 'Traces de moisissure au plafond de la salle de bains.',
    }).expect(201);
    expect(cree.body).toMatchObject({ statut: 'NOUVEAU', urgent: false, numerosUrgence: [] });

    for (const nom of ['plafond-1.jpg', 'plafond-2.jpg']) {
      await api('benevole2')
        .post('/documents')
        .field('entiteType', 'intervention')
        .field('entiteId', cree.body.id)
        .field('categorie', 'photo')
        .attach('fichier', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]), nom)
        .expect(201);
    }

    const vu = await api('gestion').get(`/travaux/interventions/${cree.body.id}`).expect(200);
    expect(vu.body.signaleParNom).toBe('benevole2');
    expect(vu.body.droits.gerer).toBe(true);
    const photos = await api('gestion').get(`/documents?entiteType=intervention&entiteId=${cree.body.id}`).expect(200);
    expect(photos.body).toHaveLength(2);
  });

  it('critère M1-2 : un signalement urgent alerte aussitôt, sans attendre la qualification (M1-R01)', async () => {
    contexte.notificateur.messages.length = 0;
    const cree = await signaler('benevole2', {
      categorie: 'GAZ',
      description: 'Forte odeur de gaz dans l’entrée, signalée par la locataire.',
    }).expect(201);

    expect(cree.body).toMatchObject({ urgent: true, priorite: 'URGENTE', statut: 'NOUVEAU' });
    expect(cree.body.numerosUrgence.map((n: { numero: string }) => n.numero)).toContain('0 800 47 33 33');

    const alerte = contexte.notificateur.messages.at(0);
    expect(alerte?.sujet).toMatch(/^\[URGENT\]/);
    expect(alerte?.destinataires.sort()).toEqual(['coordo2@exemple.org', 'gestion@exemple.org']);
    expect(alerte?.texte).not.toContain('odeur'); // aucune donnée du signalement dans le courriel

    const fil = await proprietaire.evenementIntervention.findMany({ where: { interventionId: cree.body.id } });
    expect(fil.map((e) => e.type).sort()).toEqual(['ALERTE_URGENCE', 'CREATION']);
  });

  it('M1-R03 : le gaz n’est jamais confié à un bénévole', async () => {
    const cree = await signaler('coordo2', { categorie: 'GAZ', description: 'Contrôle du raccord de la gazinière.' }).expect(201);
    const benevole = await proprietaire.utilisateur.findUniqueOrThrow({ where: { email: 'benevole2@exemple.org' } });
    const coordo = await proprietaire.utilisateur.findUniqueOrThrow({ where: { email: 'coordo2@exemple.org' } });

    const affectables = await api('coordo2').get(`/travaux/interventions/${cree.body.id}/affectables`).expect(200);
    expect(affectables.body.personnes.find((p: { id: string }) => p.id === benevole.id)?.autorisee).toBe(false);

    const refus = await api('coordo2')
      .post(`/travaux/interventions/${cree.body.id}/affectation`)
      .send({ utilisateurId: benevole.id })
      .expect(409);
    expect(refus.body.code).toBe('REGLE_M1_R03');

    await api('coordo2')
      .post(`/travaux/interventions/${cree.body.id}/affectation`)
      .send({ utilisateurId: coordo.id, datePrevue: '2026-12-01' })
      .expect(201);
  });

  it('suit le cycle complet et informe la personne qui a signalé (M1-F03, M1-R02)', async () => {
    const benevole = await proprietaire.utilisateur.findUniqueOrThrow({ where: { email: 'benevole2@exemple.org' } });
    const cree = await signaler('benevole2', { categorie: 'PLOMBERIE', description: 'La chasse d’eau fuit en continu.' }).expect(201);
    const id = cree.body.id as string;
    const statut = (sujet: string, vers: string) => api(sujet).post(`/travaux/interventions/${id}/statut`).send({ statut: vers });

    await api('benevole2').post(`/travaux/interventions/${id}/qualification`).send({ priorite: 'HAUTE', nature: 'DEPANNAGE' }).expect(403);
    const qualifiee = await api('coordo2')
      .post(`/travaux/interventions/${id}/qualification`)
      .send({ priorite: 'HAUTE', nature: 'DEPANNAGE' })
      .expect(201);
    expect(qualifiee.body.statut).toBe('QUALIFIE');

    const planifiee = await api('coordo2')
      .post(`/travaux/interventions/${id}/affectation`)
      .send({ utilisateurId: benevole.id, datePrevue: '2026-11-25' })
      .expect(201);
    expect(planifiee.body.statut).toBe('PLANIFIE');

    contexte.notificateur.messages.length = 0;
    await statut('benevole2', 'EN_COURS').expect(201);
    await statut('benevole2', 'RESOLU').expect(201);
    const refus = await statut('benevole2', 'CLOS').expect(409);
    expect(refus.body.code).toBe('ACTEUR_NON_AUTORISE');
    await statut('coordo2', 'CLOS').expect(201);
    // Le bénévole a lui-même fait les deux premières étapes : seule la clôture l'informe.
    expect(contexte.notificateur.messages.map((m) => m.destinataires)).toEqual([['benevole2@exemple.org']]);

    // Le problème revient : la personne qui l'a signalé peut rouvrir.
    const rouvert = await statut('benevole2', 'EN_COURS').expect(201);
    expect(rouvert.body).toMatchObject({ statut: 'EN_COURS', resoluLe: null, closLe: null });

    const vu = await api('coordo2').get(`/travaux/interventions/${id}`).expect(200);
    expect(vu.body.evenements.map((e: { type: string }) => e.type)).toEqual([
      'CREATION', 'QUALIFICATION', 'AFFECTATION', 'CHANGEMENT_STATUT', 'CHANGEMENT_STATUT', 'CHANGEMENT_STATUT', 'CHANGEMENT_STATUT',
    ]);
  });

  it('critère M1-3 : la fiche du logement donne l’historique et le coût (M1-F04, M1-F06)', async () => {
    const cree = await signaler('coordo2', { categorie: 'SERRURERIE', description: 'Serrure de la porte d’entrée bloquée.' }).expect(201);
    const id = cree.body.id as string;
    await api('coordo2').post(`/travaux/interventions/${id}/couts`).send({ type: 'DEVIS', libelle: 'Devis serrurier', montantCentimes: 50000 }).expect(201);
    await api('coordo2').post(`/travaux/interventions/${id}/couts`).send({ type: 'FACTURE', libelle: 'Remplacement du cylindre', montantCentimes: 43210 }).expect(201);
    await api('benevole2').post(`/travaux/interventions/${id}/couts`).send({ type: 'FACTURE', libelle: 'Petite fourniture', montantCentimes: 100 }).expect(403);
    await api('coordo2').post(`/travaux/interventions/${id}/couts`).send({ type: 'FACTURE', libelle: 'Négatif', montantCentimes: -5 }).expect(400);

    const historique = await api('benevole2').get(`/travaux/logements/${logementG2}/historique`).expect(200);
    const ligne = historique.body.interventions.find((i: { id: string }) => i.id === id);
    expect(ligne.totaux).toEqual({ devisCentimes: 50000, facturesCentimes: 43210 });
    expect(historique.body.coutTotalCentimes).toBe(43210);
    expect(new Date(historique.body.interventions[0].creeLe) >= new Date(historique.body.interventions.at(-1).creeLe)).toBe(true);
  });

  it('gère les entretiens périodiques et repart pour une période à la clôture (M1-F07)', async () => {
    const dans10Jours = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const entretien = await api('coordo2')
      .post('/travaux/entretiens')
      .send({ logementId: logementG2, libelle: 'Entretien annuel de la chaudière', categorie: 'CHAUFFAGE', periodiciteMois: 12, prochaineEcheance: dans10Jours })
      .expect(201);
    const echeances = await api('benevole2').get('/travaux/entretiens?jours=30').expect(200);
    expect(echeances.body.map((e: { id: string }) => e.id)).toContain(entretien.body.id);

    const intervention = await api('coordo2').post(`/travaux/entretiens/${entretien.body.id}/intervention`).expect(201);
    expect(intervention.body).toMatchObject({ statut: 'QUALIFIE', nature: 'ENTRETIEN' });
    for (const vers of ['EN_COURS', 'RESOLU', 'CLOS']) {
      await api('coordo2').post(`/travaux/interventions/${intervention.body.id}/statut`).send({ statut: vers }).expect(201);
    }
    const apres = await proprietaire.entretienPeriodique.findUniqueOrThrow({ where: { id: entretien.body.id } });
    const attendu = new Date();
    attendu.setUTCFullYear(attendu.getUTCFullYear() + 1);
    expect(apres.prochaineEcheance.toISOString().slice(0, 7)).toBe(attendu.toISOString().slice(0, 7));
  });

  it('partage le carnet d’artisans de l’antenne avec ses groupes (M1-F05)', async () => {
    // L'antenne est hors du périmètre du coordinateur de groupe : elle lui est masquée.
    await api('coordo2')
      .post('/travaux/artisans')
      .send({ organisationId: a.antenne, raisonSociale: 'Plomberie Dupuis', specialites: ['PLOMBERIE'] })
      .expect(404);
    const artisan = await api('gestion')
      .post('/travaux/artisans')
      .send({ organisationId: a.antenne, raisonSociale: 'Plomberie Dupuis', siret: '12345678901234', specialites: ['PLOMBERIE', 'CHAUFFAGE'] })
      .expect(201);
    const liste = await api('coordo2').get('/travaux/artisans').expect(200);
    expect(liste.body.map((x: { id: string }) => x.id)).toContain(artisan.body.id);

    const cree = await signaler('coordo2', { categorie: 'PLOMBERIE', description: 'Évier bouché depuis deux jours.' }).expect(201);
    const affectee = await api('coordo2')
      .post(`/travaux/interventions/${cree.body.id}/affectation`)
      .send({ artisanId: artisan.body.id })
      .expect(201);
    expect(affectee.body).toMatchObject({ affecteArtisanId: artisan.body.id, statut: 'PLANIFIE' });
  });

  it('ne laisse rien voir hors du périmètre ni d’une association à l’autre', async () => {
    const cree = await signaler('coordo2', { categorie: 'AUTRE', description: 'Volet roulant du salon cassé.' }).expect(201);
    await api('benevole1').get(`/travaux/interventions/${cree.body.id}`).expect(404);
    await api('admin-autre', b.association).get(`/travaux/interventions/${cree.body.id}`).expect(404);
    const liste = await api('benevole1').get('/travaux/interventions').expect(200);
    expect(liste.body).toEqual([]);
  });

  it('interdit à l’application de réécrire le fil d’une intervention', async () => {
    const application = new PrismaClient({ datasources: { db: { url: URL_APPLICATION } } });
    try {
      await expect(
        application.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.tenant_id', ${a.association}, true)`;
          return tx.evenementIntervention.updateMany({ data: { type: 'FALSIFIE' } });
        }),
      ).rejects.toThrow(/permission denied/);
    } finally {
      await application.$disconnect();
    }
  });
});
