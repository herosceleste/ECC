import { ROLE_PERMISSIONS } from '@snl/shared';
import type { Principal } from '../../src/auth/principal';
import { AutorisationService, couvre } from '../../src/autorisation/autorisation.service';

const ASSO = '/a/';
const ANTENNE = '/a/ant/';
const GROUPE_1 = '/a/ant/g1/';
const GROUPE_2 = '/a/ant/g2/';

function principal(...adhesions: Principal['adhesions']): Principal {
  return {
    utilisateurId: 'u',
    sujet: 's',
    email: 'x@exemple.org',
    nomAffiche: 'X',
    secondFacteur: true,
    tenantId: '00000000-0000-0000-0000-000000000000',
    adhesions,
  };
}

describe('AutorisationService', () => {
  const service = new AutorisationService();

  it('applique un rôle à l’organisation et à ses descendantes', () => {
    const coordinateur = principal({ organisationId: 'ant', chemin: ANTENNE, role: 'COORDINATEUR' });
    expect(service.peut(coordinateur, 'logement:ecrire', ANTENNE)).toBe(true);
    expect(service.peut(coordinateur, 'logement:ecrire', GROUPE_1)).toBe(true);
    expect(service.peut(coordinateur, 'logement:ecrire', ASSO)).toBe(false);
  });

  it('ne laisse rien voir d’un groupe voisin à un bénévole (critère M0-1)', () => {
    const benevole = principal({ organisationId: 'g1', chemin: GROUPE_1, role: 'BENEVOLE' });
    expect(service.peut(benevole, 'logement:lire', GROUPE_1)).toBe(true);
    expect(service.peut(benevole, 'logement:lire', GROUPE_2)).toBe(false);
  });

  it('refuse aux bénévoles et aux administrateurs les données sociales détaillées', () => {
    expect(ROLE_PERMISSIONS.BENEVOLE).not.toContain('personne:lire_sensible');
    expect(ROLE_PERMISSIONS.ADMINISTRATEUR).not.toContain('personne:lire_sensible');
    expect(ROLE_PERMISSIONS.TRAVAILLEUR_SOCIAL).toContain('personne:lire_sensible');
  });

  it('cumule les rôles détenus sur plusieurs organisations', () => {
    const p = principal(
      { organisationId: 'g1', chemin: GROUPE_1, role: 'BENEVOLE' },
      { organisationId: 'g2', chemin: GROUPE_2, role: 'COORDINATEUR' },
    );
    expect(service.peut(p, 'logement:ecrire', GROUPE_1)).toBe(false);
    expect(service.peut(p, 'logement:ecrire', GROUPE_2)).toBe(true);
  });

  it('exiger() lève une erreur 403 sans la permission', () => {
    const benevole = principal({ organisationId: 'g1', chemin: GROUPE_1, role: 'BENEVOLE' });
    expect(() => service.exiger(benevole, 'logement:ecrire', GROUPE_1)).toThrow(
      'Vous n’avez pas les droits nécessaires',
    );
  });

  it('calcule un périmètre sans chemins redondants', () => {
    const p = principal(
      { organisationId: 'g1', chemin: GROUPE_1, role: 'COORDINATEUR' },
      { organisationId: 'ant', chemin: ANTENNE, role: 'GESTIONNAIRE' },
      { organisationId: 'x', chemin: '/a/autre/', role: 'BENEVOLE' },
    );
    expect(service.perimetre(p, 'logement:lire').sort()).toEqual(['/a/ant/', '/a/autre/']);
    expect(service.perimetre(p, 'logement:ecrire').sort()).toEqual(['/a/ant/']);
    expect(service.perimetre(p, 'audit:lire')).toEqual([]);
  });

  it('ne confond pas deux organisations dont l’une prolonge le nom de l’autre', () => {
    expect(couvre('/a/g1/', '/a/g10/')).toBe(false);
    expect(couvre('/a/g1/', '/a/g1/x/')).toBe(true);
  });
});
