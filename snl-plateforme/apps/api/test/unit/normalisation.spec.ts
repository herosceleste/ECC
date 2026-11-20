import { estDoublonProbable, normaliserNom, normaliserTelephone } from '../../src/commun/normalisation';

describe('normalisation', () => {
  it('normalise les noms : accents, casse, ponctuation', () => {
    expect(normaliserNom('  Élodie  DUPONT-Martin ')).toBe('elodie dupont martin');
    expect(normaliserNom("N'Diaye")).toBe('n diaye');
  });

  it('normalise les numéros français', () => {
    expect(normaliserTelephone('+33 6 12 34 56 78')).toBe('0612345678');
    expect(normaliserTelephone('0033612345678')).toBe('0612345678');
    expect(normaliserTelephone('06.12.34.56.78')).toBe('0612345678');
    expect(normaliserTelephone('12')).toBeNull();
    expect(normaliserTelephone(null)).toBeNull();
  });
});

describe('estDoublonProbable (M0-R01)', () => {
  const base = { nom: 'Dupont', prenom: 'Élodie', dateNaissance: new Date('1990-04-12'), telephone: null };

  it('repère les mêmes nom, prénom et date malgré la graphie', () => {
    expect(estDoublonProbable(base, { ...base, nom: 'DUPONT', prenom: 'elodie' })).toBe(true);
  });

  it('accepte une date manquante sur l’une des fiches', () => {
    expect(estDoublonProbable(base, { ...base, dateNaissance: null })).toBe(true);
  });

  it('distingue deux homonymes nés à des dates différentes', () => {
    expect(estDoublonProbable(base, { ...base, dateNaissance: new Date('1992-01-01') })).toBe(false);
  });

  it('repère le même nom avec le même téléphone, même si le prénom diffère', () => {
    const a = { ...base, telephone: '06 12 34 56 78' };
    const b = { ...base, prenom: 'Lodie', dateNaissance: null, telephone: '+33612345678' };
    expect(estDoublonProbable(a, b)).toBe(true);
  });

  it('ne rapproche jamais deux noms différents', () => {
    expect(estDoublonProbable(base, { ...base, nom: 'Durand' })).toBe(false);
  });
});
