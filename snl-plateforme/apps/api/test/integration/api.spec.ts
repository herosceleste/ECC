import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

/**
 * Parcours HTTP complets contre une vraie base, avec des doublures pour
 * Keycloak, le stockage et l'antivirus. Les numéros renvoient aux critères
 * d'acceptation du cahier des charges.
 */
decrireAvecBase('API du socle', () => {
  const proprietaire = clientProprietaire();
  let contexte: ApplicationDeTest;
  let app: INestApplication;
  let a: Arbre;
  let b: Arbre;
  let logementG2: string;

  const api = (sujet: string, tenantId: string, mfa = true) => {
    const avecEnTetes = (r: request.Test) =>
      r.set('Authorization', jeton(sujet, mfa)).set('X-Association', tenantId);
    const http = request(app.getHttpServer());
    return {
      get: (url: string) => avecEnTetes(http.get(`/api/v1${url}`)),
      post: (url: string) => avecEnTetes(http.post(`/api/v1${url}`)),
      put: (url: string) => avecEnTetes(http.put(`/api/v1${url}`)),
      delete: (url: string) => avecEnTetes(http.delete(`/api/v1${url}`)),
    };
  };

  beforeAll(async () => {
    await viderBase(proprietaire);
    a = await creerArbre(proprietaire, 'api-a');
    b = await creerArbre(proprietaire, 'api-b');
    await creerMembre(proprietaire, a.association, a.association, 'ADMINISTRATEUR', 'admin');
    await creerMembre(proprietaire, a.association, a.groupe1, 'BENEVOLE', 'benevole');
    await creerMembre(proprietaire, a.association, a.groupe2, 'COORDINATEUR', 'coordo');
    await creerMembre(proprietaire, a.association, a.antenne, 'TRAVAILLEUR_SOCIAL', 'ts');
    await creerMembre(proprietaire, b.association, b.association, 'ADMINISTRATEUR', 'admin-b');
    logementG2 = (
      await proprietaire.logement.create({
        data: { tenantId: a.association, organisationId: a.groupe2, reference: 'G2-001', typologie: 'T3' },
      })
    ).id;
    contexte = await demarrerApplication();
    app = contexte.app;
  });

  afterAll(async () => {
    await app?.close();
    await proprietaire.$disconnect();
  });

  describe('authentification', () => {
    it('répond sans authentification sur la sonde de santé', async () => {
      await request(app.getHttpServer()).get('/sante').expect(200, { statut: 'ok' });
    });

    it('refuse une requête sans jeton ou avec un jeton invalide', async () => {
      await request(app.getHttpServer()).get('/api/v1/moi').expect(401);
      await request(app.getHttpServer()).get('/api/v1/moi').set('Authorization', 'Bearer invalide').expect(401);
    });

    it('refuse une identité inconnue : pas d’inscription libre', async () => {
      await api('inconnu', a.association).get('/organisations').expect(403);
    });

    it('exige l’en-tête X-Association sur les routes métier', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organisations')
        .set('Authorization', jeton('admin'))
        .expect(400);
    });

    it('refuse l’accès à une association dont on n’est pas membre', async () => {
      await api('benevole', b.association).get('/organisations').expect(403);
    });

    it('exige un second facteur pour un coordinateur (T-03), pas pour un bénévole', async () => {
      const refus = await api('coordo', a.association, false).get('/organisations').expect(403);
      expect(refus.body.code).toBe('SECOND_FACTEUR_REQUIS');
      await api('benevole', a.association, false).get('/organisations').expect(200);
    });
  });

  describe('périmètre des droits', () => {
    it('critère M0-1 : un bénévole ne voit pas le logement d’un autre groupe, et la tentative est journalisée', async () => {
      await api('benevole', a.association).get(`/logements/${logementG2}`).expect(404);
      const recherche = await api('benevole', a.association).get('/recherche?q=G2').expect(200);
      expect(recherche.body.logements).toEqual([]);

      const refus = await proprietaire.evenementAudit.findFirst({
        where: { entiteType: 'logement', entiteId: logementG2, resultat: 'REFUS' },
      });
      expect(refus).not.toBeNull();
    });

    it('le coordinateur du groupe voit et modifie son logement', async () => {
      await api('coordo', a.association).get(`/logements/${logementG2}`).expect(200);
      const lu = await api('coordo', a.association)
        .post('/logements')
        .send({ organisationId: a.groupe2, reference: 'G2-002', typologie: 'T2', surfaceM2: 41.5 })
        .expect(201);
      expect(lu.body.reference).toBe('G2-002');
    });

    it('le bénévole ne peut pas créer de logement', async () => {
      await api('benevole', a.association)
        .post('/logements')
        .send({ organisationId: a.groupe1, reference: 'G1-X', typologie: 'T1' })
        .expect(403);
    });

    it('ne liste que les organisations du périmètre', async () => {
      const reponse = await api('benevole', a.association).get('/organisations').expect(200);
      expect(reponse.body.map((o: { id: string }) => o.id)).toEqual([a.groupe1]);
    });

    it('rejette une donnée invalide avec un message par champ', async () => {
      const reponse = await api('coordo', a.association)
        .post('/logements')
        .send({ organisationId: a.groupe2, reference: '', typologie: 'T99' })
        .expect(400);
      expect(reponse.body.erreurs.map((e: { champ: string }) => e.champ).sort()).toEqual(['reference', 'typologie']);
    });
  });

  describe('personnes et données sensibles', () => {
    let personneId: string;

    it('crée une personne puis bloque un doublon probable (M0-R01)', async () => {
      const cree = await api('ts', a.association)
        .post('/personnes')
        .send({ organisationId: a.groupe1, nom: 'Dupont', prenom: 'Élodie', dateNaissance: '1990-04-12' })
        .expect(201);
      personneId = cree.body.id;

      const doublon = await api('ts', a.association)
        .post('/personnes')
        .send({ organisationId: a.groupe1, nom: 'DUPONT', prenom: 'elodie' })
        .expect(409);
      expect(doublon.body.code).toBe('DOUBLON_PROBABLE');
      expect(doublon.body.doublons[0].id).toBe(personneId);

      await api('ts', a.association)
        .post('/personnes')
        .send({ organisationId: a.groupe1, nom: 'DUPONT', prenom: 'elodie', confirmerMalgreDoublon: true })
        .expect(201);
    });

    it('chiffre les données sensibles et les réserve aux travailleurs sociaux', async () => {
      await api('ts', a.association)
        .put(`/personnes/${personneId}/donnees-sensibles`)
        .send({ ressourcesMensuelles: 845, situation: 'RSA' })
        .expect(200);

      const ligne = await proprietaire.donneesSensibles.findUnique({ where: { personneId } });
      expect(Buffer.from(ligne?.contenu ?? []).toString('utf8')).not.toContain('RSA');

      const lu = await api('ts', a.association).get(`/personnes/${personneId}/donnees-sensibles`).expect(200);
      expect(lu.body.donnees).toEqual({ ressourcesMensuelles: 845, situation: 'RSA' });

      await api('benevole', a.association).get(`/personnes/${personneId}`).expect(200);
      await api('benevole', a.association).get(`/personnes/${personneId}/donnees-sensibles`).expect(403);
    });

    it('journalise chaque consultation de données sensibles', async () => {
      const evenements = await proprietaire.evenementAudit.findMany({
        where: { entiteId: personneId, action: 'consulter-sensible' },
      });
      expect(evenements.map((e) => e.resultat).sort()).toEqual(['REFUS', 'SUCCES']);
    });

    it('exporte toutes les données d’une personne pour l’administrateur (M0-F10)', async () => {
      const exporte = await api('admin', a.association).get(`/personnes/${personneId}/export`).expect(200);
      expect(exporte.body.identite.nom).toBe('Dupont');
      expect(exporte.body.donneesSensibles.situation).toBe('RSA');
    });

    it('supprime logiquement une personne', async () => {
      const reponse = await api('ts', a.association).delete(`/personnes/${personneId}`).expect(200);
      expect(reponse.body.purgeDefinitiveApresJours).toBe(30);
      await api('ts', a.association).get(`/personnes/${personneId}`).expect(404);
    });
  });

  describe('documents', () => {
    it('critère M0-2 : refuse un fichier infecté sans rien stocker', async () => {
      const avant = contexte.stockage.objets.size;
      const reponse = await api('coordo', a.association)
        .post('/documents')
        .field('entiteType', 'logement')
        .field('entiteId', logementG2)
        .field('categorie', 'diagnostic')
        .attach('fichier', Buffer.from('%PDF-1.7 EICAR'), 'dpe.pdf')
        .expect(422);
      expect(reponse.body.message).toMatch(/élément dangereux/);
      expect(contexte.stockage.objets.size).toBe(avant);
    });

    it('refuse un fichier dont le contenu ne correspond pas à l’extension', async () => {
      await api('coordo', a.association)
        .post('/documents')
        .field('entiteType', 'logement')
        .field('entiteId', logementG2)
        .field('categorie', 'diagnostic')
        .attach('fichier', Buffer.from('MZ executable'), 'dpe.pdf')
        .expect(422);
    });

    it('dépose, versionne et délivre un lien temporaire', async () => {
      const deposer = () =>
        api('coordo', a.association)
          .post('/documents')
          .field('entiteType', 'logement')
          .field('entiteId', logementG2)
          .field('categorie', 'diagnostic')
          .attach('fichier', Buffer.from('%PDF-1.7 contenu sain'), 'dpe.pdf')
          .expect(201);
      const v1 = await deposer();
      const v2 = await deposer();
      expect([v1.body.version, v2.body.version]).toEqual([1, 2]);

      const lien = await api('coordo', a.association).get(`/documents/${v2.body.id}/lien`).expect(200);
      expect(lien.body.expireDansSecondes).toBe(300);
      await api('benevole', a.association).get(`/documents/${v2.body.id}/lien`).expect(404);
    });
  });

  describe('administration', () => {
    it('invite un bénévole et rattache son identité à sa première connexion', async () => {
      await api('admin', a.association)
        .post('/utilisateurs/invitations')
        .send({ email: 'nouveau@exemple.org', nomAffiche: 'Nouvelle Recrue', organisationId: a.groupe1, role: 'BENEVOLE' })
        .expect(201);
      expect(contexte.fournisseur.invitations.at(-1)).toMatchObject({
        email: 'nouveau@exemple.org',
        exigerSecondFacteur: false,
      });

      const moi = await api('nouveau', a.association).get('/moi').expect(200);
      expect(moi.body.adhesions).toEqual([expect.objectContaining({ role: 'BENEVOLE', organisationId: a.groupe1 })]);
      const compte = await proprietaire.utilisateur.findUnique({ where: { email: 'nouveau@exemple.org' } });
      expect(compte?.statut).toBe('ACTIF');
    });

    it('impose le second facteur dès l’invitation d’un coordinateur', async () => {
      await api('admin', a.association)
        .post('/utilisateurs/invitations')
        .send({ email: 'coordo2@exemple.org', nomAffiche: 'Coordo Deux', organisationId: a.groupe1, role: 'COORDINATEUR' })
        .expect(201);
      expect(contexte.fournisseur.invitations.at(-1)?.exigerSecondFacteur).toBe(true);
    });

    it('interdit à un coordinateur de gérer les utilisateurs', async () => {
      await api('coordo', a.association)
        .post('/utilisateurs/invitations')
        .send({ email: 'x@exemple.org', nomAffiche: 'X Y', organisationId: a.groupe2, role: 'BENEVOLE' })
        .expect(403);
    });

    it('refuse de retirer le dernier administrateur de l’association', async () => {
      const membres = await api('admin', a.association).get(`/utilisateurs?organisationId=${a.association}`).expect(200);
      const adhesion = membres.body.find((m: { role: string }) => m.role === 'ADMINISTRATEUR');
      await api('admin', a.association).delete(`/adhesions/${adhesion.adhesionId}`).expect(409);
    });

    it('suspend un compte, qui ne peut plus se connecter', async () => {
      const compte = await proprietaire.utilisateur.findUniqueOrThrow({ where: { email: 'benevole@exemple.org' } });
      await api('admin', a.association).post(`/utilisateurs/${compte.id}/suspension`).expect(201);
      await api('benevole', a.association).get('/organisations').expect(403);
      await api('admin', a.association).post(`/utilisateurs/${compte.id}/reactivation`).expect(201);
      await api('benevole', a.association).get('/organisations').expect(200);
    });

    it('active un module sur l’antenne et le désactive pour un seul groupe (T-12)', async () => {
      await api('admin', a.association).put(`/organisations/${a.antenne}/modules/M1`).send({ active: true }).expect(200);
      await api('admin', a.association).put(`/organisations/${a.groupe2}/modules/M1`).send({ active: false }).expect(200);

      const g1 = await api('admin', a.association).get(`/organisations/${a.groupe1}/modules`).expect(200);
      const g2 = await api('admin', a.association).get(`/organisations/${a.groupe2}/modules`).expect(200);
      const m1 = (corps: { code: string; active: boolean }[]) => corps.find((m) => m.code === 'M1')?.active;
      expect(m1(g1.body)).toBe(true);
      expect(m1(g2.body)).toBe(false);
    });

    it('réserve le journal d’audit aux administrateurs', async () => {
      await api('coordo', a.association).get('/audit').expect(403);
      const journal = await api('admin', a.association).get('/audit').expect(200);
      expect(journal.body.evenements.length).toBeGreaterThan(0);
    });

    it('ne laisse jamais l’administrateur d’une autre association voir ces données', async () => {
      await api('admin-b', b.association).get(`/logements/${logementG2}`).expect(404);
      const journal = await api('admin-b', b.association).get('/audit').expect(200);
      expect(journal.body.evenements.every((e: { tenantId: string }) => e.tenantId === b.association)).toBe(true);
    });
  });
});
