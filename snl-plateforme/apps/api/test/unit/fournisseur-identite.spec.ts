import { separerNom } from '../../src/auth/fournisseur-identite';

describe('separerNom (Keycloak exige prénom et nom séparés)', () => {
  it('sépare le premier mot du reste', () => {
    expect(separerNom('Camille Martin-Durand')).toEqual({ firstName: 'Camille', lastName: 'Martin-Durand' });
    expect(separerNom('  Anne  Marie   de La Tour ')).toEqual({ firstName: 'Anne', lastName: 'Marie de La Tour' });
  });

  it('reprend le mot unique comme nom, pour ne jamais laisser le champ vide', () => {
    expect(separerNom('Sacha')).toEqual({ firstName: 'Sacha', lastName: 'Sacha' });
  });
});
