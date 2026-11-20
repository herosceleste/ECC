import { randomBytes } from 'node:crypto';
import { ChiffrementService } from '../../src/commun/chiffrement.service';

describe('ChiffrementService', () => {
  const service = new ChiffrementService({ CLE_CHIFFREMENT_DONNEES: randomBytes(32).toString('base64') });

  it('chiffre puis déchiffre une donnée sensible', () => {
    const donnees = { ressources: 1234.5, situation: 'en recherche d’emploi' };
    const chiffre = service.chiffrer(donnees, 'personne-1');
    expect(Buffer.from(chiffre.contenu).toString('utf8')).not.toContain('emploi');
    expect(service.dechiffrer(chiffre, 'personne-1')).toEqual(donnees);
  });

  it('refuse de déchiffrer un contenu recopié sur une autre personne', () => {
    const chiffre = service.chiffrer({ a: 1 }, 'personne-1');
    expect(() => service.dechiffrer(chiffre, 'personne-2')).toThrow();
  });

  it('détecte toute altération du contenu', () => {
    const chiffre = service.chiffrer({ a: 1 }, 'p');
    chiffre.contenu[0] = (chiffre.contenu[0] ?? 0) ^ 0xff;
    expect(() => service.dechiffrer(chiffre, 'p')).toThrow();
  });

  it('refuse une clé qui ne fait pas 32 octets', () => {
    expect(() => new ChiffrementService({ CLE_CHIFFREMENT_DONNEES: randomBytes(16).toString('base64') })).toThrow();
  });
});
