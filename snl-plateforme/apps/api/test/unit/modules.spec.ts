import { ligneeDepuisChemin, resoudreModules } from '../../src/modules-plateforme/modules.service';

describe('résolution des modules (M0-F08)', () => {
  const lignee = ligneeDepuisChemin('/asso/antenne/groupe/');

  const etat = (code: string, reglages: Parameters<typeof resoudreModules>[1]) =>
    resoudreModules(lignee, reglages).find((e) => e.code === code);

  it('découpe un chemin en lignée, de la racine vers l’organisation', () => {
    expect(lignee).toEqual(['asso', 'antenne', 'groupe']);
  });

  it('désactive par défaut un module sans réglage', () => {
    expect(etat('M1', [])).toMatchObject({ active: false, regleSur: null });
  });

  it('hérite du réglage d’un ancêtre', () => {
    expect(etat('M1', [{ organisationId: 'antenne', codeModule: 'M1', active: true }])).toMatchObject({
      active: true,
      regleSur: 'antenne',
    });
  });

  it('fait primer le réglage le plus proche', () => {
    const reglages = [
      { organisationId: 'asso', codeModule: 'M2', active: true },
      { organisationId: 'groupe', codeModule: 'M2', active: false },
    ];
    expect(etat('M2', reglages)).toMatchObject({ active: false, regleSur: 'groupe' });
  });

  it('renvoie les quatorze modules', () => {
    expect(resoudreModules(lignee, [])).toHaveLength(14);
  });
});
