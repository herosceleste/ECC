import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  COOKIE_SESSION,
  ecrireSession,
  effacerSession,
  lireSession,
  ouvrir,
  retourSur,
  sceller,
  type MagasinCookies,
} from '@/lib/session';

const SECRET = randomBytes(32).toString('base64');

function magasin(): MagasinCookies & { valeurs: Map<string, string> } {
  const valeurs = new Map<string, string>();
  return {
    valeurs,
    get: (nom) => (valeurs.has(nom) ? { value: valeurs.get(nom) as string } : undefined),
    set: (nom, valeur) => valeurs.set(nom, valeur),
    delete: (nom) => valeurs.delete(nom),
  };
}

describe('session chiffrée', () => {
  const session = { jetonAcces: 'a'.repeat(1500), jetonRafraichissement: 'r'.repeat(1500), expireA: 123, associationId: 'x' };

  it('écrit puis relit une session volumineuse, découpée en plusieurs cookies', async () => {
    const m = magasin();
    await ecrireSession(m, session, SECRET, false);
    expect(m.valeurs.size).toBeGreaterThan(1);
    for (const valeur of m.valeurs.values()) expect(valeur.length).toBeLessThanOrEqual(3500);
    await expect(lireSession(m, SECRET)).resolves.toEqual(session);
  });

  it('ne laisse rien lire en clair dans le cookie', async () => {
    const m = magasin();
    await ecrireSession(m, { ...session, jetonAcces: 'JETON-SECRET' }, SECRET, false);
    expect([...m.valeurs.values()].join('')).not.toContain('JETON-SECRET');
  });

  it('rejette un cookie altéré ou chiffré avec une autre clé', async () => {
    const m = magasin();
    await ecrireSession(m, session, SECRET, false);
    await expect(lireSession(m, randomBytes(32).toString('base64'))).resolves.toBeNull();
    const premier = `${COOKIE_SESSION}.0`;
    m.valeurs.set(premier, `${m.valeurs.get(premier)?.slice(0, -4)}AAAA`);
    await expect(lireSession(m, SECRET)).resolves.toBeNull();
  });

  it('efface tous les morceaux, y compris ceux d’une session précédente plus longue', async () => {
    const m = magasin();
    await ecrireSession(m, session, SECRET, false);
    await ecrireSession(m, { jetonAcces: 'court', expireA: 1 }, SECRET, false);
    expect(m.valeurs.size).toBe(1);
    effacerSession(m);
    expect(m.valeurs.size).toBe(0);
  });

  it('refuse un contenu expiré', async () => {
    const scelle = await sceller({ a: 1 }, SECRET, -10);
    await expect(ouvrir(scelle, SECRET)).resolves.toBeNull();
  });
});

describe('retourSur', () => {
  it('accepte un chemin interne', () => {
    expect(retourSur('/logements?statut=OCCUPE')).toBe('/logements?statut=OCCUPE');
  });

  it.each(['https://pirate.example', '//pirate.example', '/\\pirate.example', 'logements', '', null])(
    'refuse une redirection ouverte : %s',
    (valeur) => {
      expect(retourSur(valeur)).toBe('/');
    },
  );
});
