import { trierContenus } from '../../src/accueil/integration.service';
import { empreinte, TEXTES_PAR_DEFAUT } from '../../src/confidentialite/confidentialite.service';

describe('ordre des contenus d’accueil', () => {
  it('va du national au local, puis suit l’ordre choisi', () => {
    const organisations = [
      { id: 'asso', chemin: '/asso/' },
      { id: 'ant', chemin: '/asso/ant/' },
      { id: 'grp', chemin: '/asso/ant/grp/' },
    ];
    const c = (organisationId: string, ordre: number, titre: string) => ({ organisationId, ordre, titre });
    const tries = trierContenus([c('grp', 1, 'G'), c('asso', 2, 'N2'), c('ant', 1, 'A'), c('asso', 1, 'N1')], organisations);
    expect(tries.map((x) => x.titre)).toEqual(['N1', 'N2', 'A', 'G']);
  });
});

describe('empreinte d’un engagement', () => {
  it('change dès que le texte change, même d’un caractère', () => {
    const { titre, corps } = TEXTES_PAR_DEFAUT.ENGAGEMENT_CONFIDENTIALITE;
    expect(empreinte(titre, corps)).toMatch(/^[0-9a-f]{64}$/);
    expect(empreinte(titre, corps)).toBe(empreinte(titre, corps));
    expect(empreinte(titre, `${corps}.`)).not.toBe(empreinte(titre, corps));
  });
});
