import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { IntegrationService } from '../../src/accueil/integration.service';
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

/** Module M3 Accueil des bénévoles, côté API. */
decrireAvecBase('Module M3 Accueil des bénévoles', () => {
  const proprietaire = clientProprietaire();
  let contexte: ApplicationDeTest;
  let app: INestApplication;
  let a: Arbre;
  const ids: Record<string, string> = {};
  let menageId: string;

  const api = (sujet: string) => {
    const http = request(app.getHttpServer());
    const avec = (r: request.Test) => r.set('Authorization', jeton(sujet)).set('X-Association', a.association);
    return {
      get: (url: string) => avec(http.get(`/api/v1${url}`)),
      post: (url: string) => avec(http.post(`/api/v1${url}`)),
      patch: (url: string) => avec(http.patch(`/api/v1${url}`)),
    };
  };
  const contenu = (sujet: string, organisationId: string, type: string, titre: string, corps = 'Texte de démonstration.', ordre = 0) =>
    api(sujet).post('/integration/contenus').send({ organisationId, type, titre, corps, ordre });

  beforeAll(async () => {
    await viderBase(proprietaire);
    a = await creerArbre(proprietaire, 'acc-a');
    ids.admin = await creerMembre(proprietaire, a.association, a.association, 'ADMINISTRATEUR', 'admin');
    ids.coordoAnt = await creerMembre(proprietaire, a.association, a.antenne, 'COORDINATEUR', 'coordo-ant');
    ids.coordo2 = await creerMembre(proprietaire, a.association, a.groupe2, 'COORDINATEUR', 'coordo2');
    ids.b1 = await creerMembre(proprietaire, a.association, a.groupe2, 'BENEVOLE', 'b1');
    ids.b2 = await creerMembre(proprietaire, a.association, a.groupe2, 'BENEVOLE', 'b2');
    ids.g1 = await creerMembre(proprietaire, a.association, a.groupe1, 'BENEVOLE', 'g1');
    await proprietaire.activationModule.createMany({
      data: [
        { tenantId: a.association, organisationId: a.antenne, codeModule: 'M3', active: true },
        { tenantId: a.association, organisationId: a.groupe1, codeModule: 'M3', active: false },
      ],
    });
    const menage = await proprietaire.menage.create({ data: { tenantId: a.association, organisationId: a.groupe2, libelle: 'Famille Accueil' } });
    menageId = menage.id;
    await proprietaire.personne.create({
      data: { tenantId: a.association, organisationId: a.groupe2, menageId, nom: 'Accueil', prenom: 'Lou', nomNormalise: 'accueil' },
    });
    contexte = await demarrerApplication();
    app = contexte.app;
  });

  afterAll(async () => {
    await app?.close();
    await proprietaire.$disconnect();
  });

  it('M3-R02 : contenus nationaux, d’antenne et de groupe, chacun modifiable par les siens', async () => {
    const national = await contenu('admin', a.association, 'ETAPE', 'Découvrir SNL', 'Histoire et valeurs.', 1).expect(201);
    await contenu('coordo-ant', a.antenne, 'ETAPE', 'Rencontrer l’antenne', 'Qui fait quoi.', 1).expect(201);
    await contenu('coordo2', a.groupe2, 'ETAPE', 'Visiter un logement', 'Avec un bénévole expérimenté.', 1).expect(201);

    // Un groupe ne touche pas aux contenus nationaux : ils lui sont masqués en écriture.
    await api('coordo2').patch(`/integration/contenus/${national.body.id}`).send({ titre: 'Modifié' }).expect(404);
    await api('coordo-ant').patch(`/integration/contenus/${national.body.id}`).send({ titre: 'Modifié' }).expect(404);
    await contenu('b1', a.groupe2, 'FICHE', 'Fiche') .expect(403);

    const vus = await api('b1').get('/integration/contenus?type=ETAPE').expect(200);
    expect(vus.body.map((c: { titre: string }) => c.titre)).toEqual(['Découvrir SNL', 'Rencontrer l’antenne', 'Visiter un logement']);
    expect(vus.body.every((c: { modifiable: boolean }) => !c.modifiable)).toBe(true);
    // L'administrateur de l'association voit les contenus nationaux même si M3
    // n'est activé que plus bas (ici sur l'antenne).
    const vusParAdmin = await api('admin').get('/integration/contenus?type=ETAPE').expect(200);
    expect(vusParAdmin.body.map((c: { titre: string; modifiable: boolean }) => [c.titre, c.modifiable])).toEqual([
      ['Découvrir SNL', true],
      ['Rencontrer l’antenne', true],
      ['Visiter un logement', true],
    ]);
    const vusParCoordo = await api('coordo2').get('/integration/contenus?type=ETAPE').expect(200);
    expect(vusParCoordo.body.map((c: { modifiable: boolean }) => c.modifiable)).toEqual([false, false, true]);
  });

  it('réserve la charte et l’engagement de confidentialité au niveau de l’association', async () => {
    await contenu('coordo2', a.groupe2, 'ENGAGEMENT_CONFIDENTIALITE', 'Mon engagement').expect(400);
  });

  it('critère M3-2 : sans engagement signé, aucune donnée de ménage (M3-R01)', async () => {
    const refus = await api('b1').get(`/menages/${menageId}`).expect(403);
    expect(refus.body.code).toBe('ENGAGEMENT_CONFIDENTIALITE_REQUIS');
    await api('b1').get('/menages').expect(403);
    expect((await api('b1').get('/recherche?q=accueil').expect(200)).body.personnes).toEqual([]);

    const engagements = await api('b1').get('/integration/engagements').expect(200);
    const confidentialite = engagements.body.find((e: { type: string }) => e.type === 'ENGAGEMENT_CONFIDENTIALITE');
    expect(confidentialite).toMatchObject({ signe: false, parDefaut: true });

    await api('b1').post('/integration/engagements/ENGAGEMENT_CONFIDENTIALITE/signature').send({ empreinte: '0'.repeat(64), accepte: true }).expect(409);
    await api('b1')
      .post('/integration/engagements/ENGAGEMENT_CONFIDENTIALITE/signature')
      .send({ empreinte: confidentialite.empreinte, accepte: true })
      .expect(201);
    await api('b1').get(`/menages/${menageId}`).expect(200);
    expect((await api('b1').get('/recherche?q=accueil').expect(200)).body.personnes).toHaveLength(1);
  });

  it('demande une nouvelle signature quand l’association change le texte', async () => {
    await contenu('admin', a.association, 'ENGAGEMENT_CONFIDENTIALITE', 'Engagement de confidentialité SNL', 'Nouvelle version du texte.').expect(201);
    await api('b1').get(`/menages/${menageId}`).expect(403);
  });

  it('suit la progression du parcours (M3-F01)', async () => {
    const parcours = await api('b1').get('/integration/mon-parcours').expect(200);
    expect(parcours.body).toMatchObject({ actif: true, nombreTerminees: 0, complet: false });
    const [premiere, deuxieme] = parcours.body.etapes as { id: string }[];
    await api('b1').post(`/integration/etapes/${premiere?.id}`).send({ terminee: true }).expect(201);
    await api('b1').post(`/integration/etapes/${deuxieme?.id}`).send({ terminee: true }).expect(201);
    const apres = await api('b1').get('/integration/mon-parcours').expect(200);
    expect(apres.body).toMatchObject({ nombreTerminees: 2, complet: false });

    const horsModule = await api('g1').get('/integration/mon-parcours').expect(200);
    expect(horsModule.body).toMatchObject({ actif: false, etapes: [] });
    await api('g1').post(`/integration/etapes/${premiere?.id}`).send({ terminee: true }).expect(404);
  });

  it('cherche dans la foire aux questions en français (M3-F05)', async () => {
    await contenu('admin', a.association, 'FAQ', 'Comment signaler une fuite d’eau ?', 'Utilisez le module Travaux et cochez « urgent » si l’eau coule.').expect(201);
    await contenu('admin', a.association, 'FAQ', 'Qui contacter au siège ?', 'Le secrétariat de SNL Essonne.').expect(201);
    const pluriel = await api('b1').get('/integration/faq?q=fuites').expect(200);
    expect(pluriel.body.map((r: { titre: string }) => r.titre)).toEqual(['Comment signaler une fuite d’eau ?']);
    const sigle = await api('b1').get('/integration/faq?q=SNL').expect(200);
    expect(sigle.body.map((r: { titre: string }) => r.titre)).toContain('Qui contacter au siège ?');
  });

  it('critère M3-3 : parrain désigné, prévenu, puis relancé une fois si le parcours traîne (M3-F04)', async () => {
    contexte.notificateur.messages.length = 0;
    await api('b1').post('/integration/parrainages').send({ organisationId: a.groupe2, filleulId: ids.b2, parrainId: ids.b1 }).expect(403);
    const parrainage = await api('coordo2')
      .post('/integration/parrainages')
      .send({ organisationId: a.groupe2, filleulId: ids.b1, parrainId: ids.b2 })
      .expect(201);
    expect(contexte.notificateur.messages.map((m) => [m.destinataires, m.sujet])).toEqual([[['b2@exemple.org'], 'Vous accompagnez b1']]);

    const vuParLeParrain = await api('b2').get('/integration/mon-parcours').expect(200);
    expect(vuParLeParrain.body.filleuls).toEqual([
      expect.objectContaining({ parrainageId: parrainage.body.id, nomAffiche: 'b1', etapesTerminees: 2, etapesTotal: 3 }),
    ]);

    // Le parrain planifie un point d'étape et le marque comme fait.
    const point = await api('b2').post(`/integration/parrainages/${parrainage.body.id}/points`).send({ date: '2026-12-10' }).expect(201);
    await api('b2').post(`/integration/points/${point.body.id}/fait`).expect(201);

    const suivi = await api('coordo2').get('/integration/suivi').expect(200);
    const ligne = suivi.body.find((l: { utilisateurId: string }) => l.utilisateurId === ids.b1);
    expect(ligne).toMatchObject({ etapesTerminees: 2, etapesTotal: 3, parrainage: { parrainNom: 'b2' } });

    contexte.notificateur.messages.length = 0;
    const taches = app.get(IntegrationService);
    expect(await taches.executerTaches()).toEqual({ relances: 0 }); // trop tôt
    const dans31Jours = new Date(Date.now() + 31 * 86_400_000);
    expect(await taches.executerTaches(dans31Jours)).toEqual({ relances: 1 });
    expect(contexte.notificateur.messages.at(0)).toMatchObject({ destinataires: ['b2@exemple.org'], sujet: 'Nouvelles de b1 ?' });
    expect(await taches.executerTaches(dans31Jours)).toEqual({ relances: 0 });
  });
});
