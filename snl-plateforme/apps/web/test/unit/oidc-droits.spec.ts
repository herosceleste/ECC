import { createHash, randomBytes } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { erreurDepuisReponse } from '@/lib/api';
import { peut } from '@/lib/droits';
import { identifiantCourt } from '@/lib/format';
import { aleatoire, defiPkce, urlAutorisation } from '@/lib/oidc';

beforeAll(() => {
  process.env.OIDC_ISSUER = 'https://identite.exemple/realms/snl';
  process.env.URL_PUBLIQUE_WEB = 'https://plateforme.exemple';
  process.env.SECRET_SESSION = randomBytes(32).toString('base64');
});

describe('PKCE', () => {
  it('calcule le défi S256 : SHA-256 du vérificateur, en base64url sans remplissage', async () => {
    const verificateur = aleatoire(48);
    const attendu = createHash('sha256').update(verificateur).digest('base64url');
    const defi = await defiPkce(verificateur);
    expect(defi).toBe(attendu);
    expect(defi).not.toMatch(/[=+/]/);
  });

  it('produit des valeurs aléatoires distinctes et sûres pour une URL', () => {
    const a = aleatoire();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(aleatoire()).not.toBe(a);
  });

  it('construit une demande d’autorisation complète', async () => {
    const url = new URL(await urlAutorisation('etat-1', 'verificateur'));
    expect(url.origin + url.pathname).toBe('https://identite.exemple/realms/snl/protocol/openid-connect/auth');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: 'snl-web',
      response_type: 'code',
      state: 'etat-1',
      code_challenge_method: 'S256',
      redirect_uri: 'https://plateforme.exemple/auth/rappel',
    });
  });
});

describe('droits affichés', () => {
  const adhesions = [{ organisationId: 'g1', chemin: '/a/ant/g1/', role: 'COORDINATEUR' as const }];

  it('suit le périmètre de l’organisation', () => {
    expect(peut(adhesions, 'logement:ecrire', '/a/ant/g1/')).toBe(true);
    expect(peut(adhesions, 'logement:ecrire', '/a/ant/g2/')).toBe(false);
    expect(peut(adhesions, 'audit:lire')).toBe(false);
  });
});

describe('erreurs de l’API', () => {
  it('reprend le message et le détail par champ', () => {
    const erreur = erreurDepuisReponse(400, {
      message: 'Les données envoyées ne sont pas valides.',
      erreurs: [{ champ: 'reference', message: 'trop court' }],
    });
    expect(erreur.message).toBe('Les données envoyées ne sont pas valides.');
    expect(erreur.erreurs).toEqual([{ champ: 'reference', message: 'trop court' }]);
  });

  it('conserve le code métier (doublon, second facteur)', () => {
    expect(erreurDepuisReponse(409, { message: 'x', code: 'DOUBLON_PROBABLE' }).code).toBe('DOUBLON_PROBABLE');
  });

  it('fournit un message en français quand l’API n’en donne pas', () => {
    expect(erreurDepuisReponse(503, null).message).toMatch(/Réessayez/);
  });
});

describe('identifiantCourt', () => {
  it('déduit un identifiant lisible d’un nom', () => {
    expect(identifiantCourt('Groupe local de Massy-Palaiseau !')).toBe('groupe-local-de-massy-palaiseau');
  });
});
