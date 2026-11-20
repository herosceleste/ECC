import {
  affectationAutorisee,
  ajouterMois,
  estUrgent,
  transitionsPossibles,
  verifierTransition,
  type Acteur,
} from '../../src/travaux/regles';

const gestionnaire: Acteur = { gestionnaire: true, affecte: false, signaleur: false };
const affecte: Acteur = { gestionnaire: false, affecte: true, signaleur: false };
const signaleur: Acteur = { gestionnaire: false, affecte: false, signaleur: true };
const temoin: Acteur = { gestionnaire: false, affecte: false, signaleur: false };

describe('cycle de vie d’une intervention', () => {
  it('laisse la personne affectée démarrer puis résoudre', () => {
    expect(verifierTransition('PLANIFIE', 'EN_COURS', affecte, null)).toBeNull();
    expect(verifierTransition('EN_COURS', 'RESOLU', affecte, null)).toBeNull();
  });

  it('réserve la clôture au coordinateur ou au gestionnaire (M1-R02)', () => {
    expect(verifierTransition('RESOLU', 'CLOS', gestionnaire, new Date())).toBeNull();
    expect(verifierTransition('RESOLU', 'CLOS', affecte, new Date())).toBe('ACTEUR_NON_AUTORISE');
    expect(verifierTransition('RESOLU', 'CLOS', signaleur, new Date())).toBe('ACTEUR_NON_AUTORISE');
  });

  it('permet au signaleur de rouvrir dans les 15 jours, pas au-delà (M1-R02)', () => {
    const maintenant = new Date('2026-11-20T12:00:00Z');
    const ilYa10Jours = new Date('2026-11-10T12:00:00Z');
    const ilYa16Jours = new Date('2026-11-04T12:00:00Z');
    expect(verifierTransition('CLOS', 'EN_COURS', signaleur, ilYa10Jours, maintenant)).toBeNull();
    expect(verifierTransition('CLOS', 'EN_COURS', signaleur, ilYa16Jours, maintenant)).toBe('DELAI_REOUVERTURE_DEPASSE');
    expect(verifierTransition('CLOS', 'EN_COURS', gestionnaire, ilYa16Jours, maintenant)).toBeNull();
  });

  it('refuse les sauts d’étape et toute action à un simple témoin', () => {
    expect(verifierTransition('NOUVEAU', 'RESOLU', gestionnaire, null)).toBe('TRANSITION_IMPOSSIBLE');
    expect(verifierTransition('ANNULE', 'EN_COURS', gestionnaire, null)).toBe('TRANSITION_IMPOSSIBLE');
    expect(transitionsPossibles('EN_COURS', temoin, null)).toEqual([]);
  });

  it('propose à chacun les seules actions qui lui sont permises', () => {
    expect(transitionsPossibles('RESOLU', gestionnaire, new Date()).sort()).toEqual(['CLOS', 'EN_COURS']);
    expect(transitionsPossibles('RESOLU', signaleur, new Date())).toEqual(['EN_COURS']);
    expect(transitionsPossibles('EN_COURS', affecte, null)).toEqual(['RESOLU']);
  });
});

describe('garde-fous', () => {
  it('ne confie jamais le gaz ou l’électricité à un bénévole (M1-R03)', () => {
    expect(affectationAutorisee('GAZ', ['BENEVOLE'])).toBe(false);
    expect(affectationAutorisee('ELECTRICITE', ['BENEVOLE', 'TRAVAILLEUR_SOCIAL'])).toBe(false);
    expect(affectationAutorisee('ELECTRICITE', ['BENEVOLE', 'COORDINATEUR'])).toBe(true);
    expect(affectationAutorisee('PLOMBERIE', ['BENEVOLE'])).toBe(true);
  });

  it('traite toujours le gaz comme urgent (M1-R01)', () => {
    expect(estUrgent('GAZ', false)).toBe(true);
    expect(estUrgent('PLOMBERIE', false)).toBe(false);
    expect(estUrgent('PLOMBERIE', true)).toBe(true);
  });
});

describe('ajouterMois', () => {
  it('avance d’une période sans déborder sur le mois suivant', () => {
    expect(ajouterMois(new Date('2026-01-31'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
    expect(ajouterMois(new Date('2026-03-15'), 12).toISOString().slice(0, 10)).toBe('2027-03-15');
    expect(ajouterMois(new Date('2028-01-31'), 1).toISOString().slice(0, 10)).toBe('2028-02-29');
  });
});
