import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ActivitesService } from '../../src/benevoles/activites.service';
import {
  clientProprietaire,
  creerArbre,
  creerMembre,
  decrireAvecBase,
  demarrerApplication,
  jeton,
  viderBase,
  type ApplicationDeTest,
  type Arbre,
} from './outils';

/** Module M2 Coordination des bénévoles, côté API. */
decrireAvecBase('Module M2 Coordination des bénévoles', () => {
  const proprietaire = clientProprietaire();
  let contexte: ApplicationDeTest;
  let app: INestApplication;
  let a: Arbre;
  const ids: Record<string, string> = {};

  const api = (sujet: string) => {
    const http = request(app.getHttpServer());
    const avec = (r: request.Test) => r.set('Authorization', jeton(sujet)).set('X-Association', a.association);
    return {
      get: (url: string) => avec(http.get(`/api/v1${url}`)),
      post: (url: string) => avec(http.post(`/api/v1${url}`)),
      put: (url: string) => avec(http.put(`/api/v1${url}`)),
    };
  };
  const dans = (heures: number) => new Date(Date.now() + heures * 3_600_000).toISOString();
  const creerActivite = (corps: Record<string, unknown>) =>
    api('coordo2')
      .post('/benevoles/activites')
      .send({ organisationId: a.groupe2, type: 'CHANTIER', titre: 'Chantier peinture', debut: dans(72), fin: dans(75), ...corps });
  const messagesPour = (email: string) => contexte.notificateur.messages.filter((m) => m.destinataires.includes(email));

  beforeAll(async () => {
    await viderBase(proprietaire);
    a = await creerArbre(proprietaire, 'ben-a');
    ids.coordo2 = await creerMembre(proprietaire, a.association, a.groupe2, 'COORDINATEUR', 'coordo2');
    ids.coordo1 = await creerMembre(proprietaire, a.association, a.groupe1, 'COORDINATEUR', 'coordo1');
    for (const b of ['b1', 'b2', 'b3']) ids[b] = await creerMembre(proprietaire, a.association, a.groupe2, 'BENEVOLE', b);
    await proprietaire.activationModule.createMany({
      data: [
        { tenantId: a.association, organisationId: a.antenne, codeModule: 'M2', active: true },
        { tenantId: a.association, organisationId: a.groupe1, codeModule: 'M2', active: false },
      ],
    });
    contexte = await demarrerApplication();
    app = contexte.app;
  });

  afterAll(async () => {
    await app?.close();
    await proprietaire.$disconnect();
  });

  it('refuse toute activité là où le module n’est pas activé', async () => {
    const r = await api('coordo1')
      .post('/benevoles/activites')
      .send({ organisationId: a.groupe1, type: 'REUNION', titre: 'Réunion de groupe', debut: dans(24), fin: dans(26) })
      .expect(403);
    expect(r.body.message).toMatch(/n’est pas activé/);
  });

  it('critères M2-1 et M2-2 : liste d’attente, place libérée et coordination prévenue', async () => {
    const activite = await creerActivite({ places: 2 }).expect(201);
    const id = activite.body.id as string;
    expect((await api('b1').post(`/benevoles/activites/${id}/inscription`).expect(201)).body.statut).toBe('INSCRIT');
    expect((await api('b2').post(`/benevoles/activites/${id}/inscription`).expect(201)).body.statut).toBe('INSCRIT');
    expect((await api('b3').post(`/benevoles/activites/${id}/inscription`).expect(201)).body.statut).toBe('LISTE_ATTENTE');
    await api('b3').post(`/benevoles/activites/${id}/inscription`).expect(409);

    contexte.notificateur.messages.length = 0;
    await api('b1').post(`/benevoles/activites/${id}/desistement`).expect(201);

    const detail = await api('coordo2').get(`/benevoles/activites/${id}`).expect(200);
    expect(detail.body.inscrits).toBe(2);
    expect(detail.body.inscriptions.map((i: { utilisateurId: string; statut: string }) => [i.utilisateurId, i.statut])).toEqual(
      expect.arrayContaining([[ids.b2, 'INSCRIT'], [ids.b3, 'INSCRIT']]),
    );
    expect(messagesPour('b3@exemple.org').map((m) => m.sujet)).toEqual(['Une place s’est libérée : Chantier peinture']);
    expect(messagesPour('coordo2@exemple.org').map((m) => m.sujet)).toEqual(['Désistement : Chantier peinture']);
  });

  it('ne donne jamais la même dernière place à deux inscriptions simultanées', async () => {
    const nombre = 10;
    for (let i = 0; i < nombre; i += 1) {
      ids[`r${i}`] = await creerMembre(proprietaire, a.association, a.groupe2, 'BENEVOLE', `rafale${i}`);
    }
    const activite = await creerActivite({ places: 1, titre: 'Visite de convivialité', type: 'VISITE' }).expect(201);
    const reponses = await Promise.all(
      Array.from({ length: nombre }, (_, i) => api(`rafale${i}`).post(`/benevoles/activites/${activite.body.id}/inscription`)),
    );
    const statuts = reponses.map((r) => r.body.statut);
    expect(statuts.filter((s) => s === 'INSCRIT')).toHaveLength(1);
    expect(statuts.filter((s) => s === 'LISTE_ATTENTE')).toHaveLength(nombre - 1);
  });

  it('critère M2-3 : un référent voit son ménage mais jamais ses données sociales (M2-R01)', async () => {
    const menage = await proprietaire.menage.create({
      data: { tenantId: a.association, organisationId: a.groupe2, libelle: 'Famille Test' },
    });
    const personne = await proprietaire.personne.create({
      data: { tenantId: a.association, organisationId: a.groupe2, menageId: menage.id, nom: 'Test', prenom: 'Lou', nomNormalise: 'test' },
    });
    await api('b1').post(`/benevoles/menages/${menage.id}/referents`).send({ utilisateurId: ids.b1 }).expect(403);
    await api('coordo2').post(`/benevoles/menages/${menage.id}/referents`).send({ utilisateurId: ids.b1 }).expect(201);
    await api('coordo2').post(`/benevoles/menages/${menage.id}/referents`).send({ utilisateurId: ids.b1 }).expect(409);

    const mesMenages = await api('b1').get('/benevoles/moi/menages').expect(200);
    expect(mesMenages.body).toEqual([{ id: menage.id, libelle: 'Famille Test', organisationId: a.groupe2 }]);
    await api('b1').get(`/personnes/${personne.id}`).expect(200);
    await api('b1').get(`/personnes/${personne.id}/donnees-sensibles`).expect(403);
  });

  it('M2-R03 : un téléphone masqué n’est visible que du titulaire et des coordinateurs', async () => {
    await api('b2').put('/benevoles/moi/profil').send({ telephone: '06 11 22 33 44', telephoneMasque: true, competences: ['Peinture'] }).expect(200);
    const tel = async (lecteur: string) =>
      (await api(lecteur).get('/benevoles/annuaire').expect(200)).body.find((m: { id: string }) => m.id === ids.b2);
    expect((await tel('b1')).telephone).toBeNull();
    expect((await tel('b1')).competences).toEqual(['Peinture']);
    expect((await tel('b1')).disponibilites).toBeUndefined();
    expect((await tel('b2')).telephone).toBe('06 11 22 33 44');
    expect((await tel('coordo2')).telephone).toBe('06 11 22 33 44');
  });

  it('enregistre les disponibilités et refuse les saisies incohérentes (M2-F02)', async () => {
    await api('b1').post('/benevoles/moi/disponibilites').send({ jourSemaine: 1, heureDebut: '14:00', heureFin: '17:00' }).expect(201);
    await api('b1').post('/benevoles/moi/disponibilites').send({ heureDebut: '14:00', heureFin: '17:00' }).expect(400);
    await api('b1').post('/benevoles/moi/disponibilites').send({ jourSemaine: 2, heureDebut: '18:00', heureFin: '09:00' }).expect(400);
    const annuaire = await api('coordo2').get('/benevoles/annuaire').expect(200);
    expect(annuaire.body.find((m: { id: string }) => m.id === ids.b1).disponibilites).toHaveLength(1);
  });

  it('rappelle les inscrits et alerte la coordination, une seule fois (M2-F04, M2-R02)', async () => {
    const vide = await creerActivite({ titre: 'Permanence du samedi', type: 'PERMANENCE', debut: dans(30), fin: dans(32) }).expect(201);
    const pleine = await creerActivite({ titre: 'Réunion mensuelle', type: 'REUNION', debut: dans(20), fin: dans(22) }).expect(201);
    await api('b2').post(`/benevoles/activites/${pleine.body.id}/inscription`).expect(201);

    contexte.notificateur.messages.length = 0;
    const taches = app.get(ActivitesService);
    const premier = await taches.executerTaches();
    expect(premier.rappels).toBeGreaterThanOrEqual(1);
    expect(messagesPour('b2@exemple.org').some((m) => m.sujet.startsWith('Rappel : Réunion mensuelle'))).toBe(true);
    expect(messagesPour('coordo2@exemple.org').some((m) => m.sujet === 'Aucun inscrit : Permanence du samedi')).toBe(true);
    expect(vide.body.id).toBeTruthy();

    const second = await taches.executerTaches();
    expect(second).toEqual({ rappels: 0, alertes: 0 });
  });

  it('exporte mes activités au format iCalendar (M2-F06)', async () => {
    const r = await api('b3').get('/benevoles/moi/agenda.ics').expect(200);
    expect(r.headers['content-type']).toMatch(/text\/calendar/);
    expect(r.text).toContain('SUMMARY:Chantier peinture');
    expect(r.text).not.toContain('Réunion mensuelle');
  });

  it('organise un chantier collectif lié à une intervention du groupe (M1-F08)', async () => {
    const logement = await proprietaire.logement.create({
      data: { tenantId: a.association, organisationId: a.groupe2, reference: 'B-01', typologie: 'T2' },
    });
    const logement1 = await proprietaire.logement.create({
      data: { tenantId: a.association, organisationId: a.groupe1, reference: 'B-02', typologie: 'T2' },
    });
    const base = { tenantId: a.association, categorie: 'MENUISERIE' as const, description: 'Repeindre les volets', signalePar: ids.coordo2 as string };
    const ici = await proprietaire.intervention.create({ data: { ...base, organisationId: a.groupe2, logementId: logement.id } });
    const ailleurs = await proprietaire.intervention.create({ data: { ...base, organisationId: a.groupe1, logementId: logement1.id } });
    await creerActivite({ titre: 'Chantier volets', interventionId: ici.id }).expect(201);
    await creerActivite({ titre: 'Chantier volets', interventionId: ailleurs.id }).expect(404);
  });
});
