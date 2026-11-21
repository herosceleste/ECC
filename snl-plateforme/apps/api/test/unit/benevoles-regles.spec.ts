import {
  aPromouvoir,
  doitAlerterSansInscrit,
  doitRecevoirRappel,
  genererIcs,
  statutNouvelleInscription,
  telephoneVisible,
} from '../../src/benevoles/regles';

describe('places et liste d’attente', () => {
  it('confirme tant qu’il reste une place, puis met en attente (critère M2-1)', () => {
    expect(statutNouvelleInscription(6, 5)).toBe('INSCRIT');
    expect(statutNouvelleInscription(6, 6)).toBe('LISTE_ATTENTE');
    expect(statutNouvelleInscription(null, 100)).toBe('INSCRIT');
  });

  it('fait monter la plus ancienne personne en attente quand une place se libère', () => {
    const t = (min: number) => new Date(Date.UTC(2026, 0, 1, 10, min));
    const inscriptions = [
      { id: 'a', statut: 'INSCRIT' as const, creeLe: t(0) },
      { id: 'b', statut: 'DESISTE' as const, creeLe: t(1) },
      { id: 'tardif', statut: 'LISTE_ATTENTE' as const, creeLe: t(9) },
      { id: 'premier', statut: 'LISTE_ATTENTE' as const, creeLe: t(5) },
    ];
    expect(aPromouvoir(2, inscriptions)).toBe('premier');
    expect(aPromouvoir(1, inscriptions)).toBeNull();
  });
});

describe('téléphone masqué (M2-R03)', () => {
  const profil = { telephone: '06 12 34 56 78', telephoneMasque: true };
  it('le cache aux autres bénévoles, pas au titulaire ni aux coordinateurs', () => {
    expect(telephoneVisible(profil, { estTitulaire: false, coordonne: false })).toBeNull();
    expect(telephoneVisible(profil, { estTitulaire: true, coordonne: false })).toBe('06 12 34 56 78');
    expect(telephoneVisible(profil, { estTitulaire: false, coordonne: true })).toBe('06 12 34 56 78');
    expect(telephoneVisible({ ...profil, telephoneMasque: false }, { estTitulaire: false, coordonne: false })).toBe(
      '06 12 34 56 78',
    );
  });
});

describe('rappels et alertes', () => {
  const maintenant = new Date('2026-11-20T10:00:00Z');
  const base = { annuleeLe: null, rappelEnvoyeLe: null, alerteSansInscritLe: null, inscrits: 3 };
  const dans = (h: number) => new Date(maintenant.getTime() + h * 3_600_000);

  it('rappelle une seule fois, dans les 24 heures qui précèdent (M2-F04)', () => {
    expect(doitRecevoirRappel({ ...base, debut: dans(20) }, maintenant)).toBe(true);
    expect(doitRecevoirRappel({ ...base, debut: dans(30) }, maintenant)).toBe(false);
    expect(doitRecevoirRappel({ ...base, debut: dans(20), rappelEnvoyeLe: maintenant }, maintenant)).toBe(false);
    expect(doitRecevoirRappel({ ...base, debut: dans(-1) }, maintenant)).toBe(false);
    expect(doitRecevoirRappel({ ...base, debut: dans(20), annuleeLe: maintenant }, maintenant)).toBe(false);
  });

  it('alerte si personne n’est inscrit 48 heures avant (M2-R02)', () => {
    expect(doitAlerterSansInscrit({ ...base, inscrits: 0, debut: dans(40) }, maintenant)).toBe(true);
    expect(doitAlerterSansInscrit({ ...base, inscrits: 1, debut: dans(40) }, maintenant)).toBe(false);
    expect(doitAlerterSansInscrit({ ...base, inscrits: 0, debut: dans(60) }, maintenant)).toBe(false);
  });
});

describe('export iCalendar (M2-F06)', () => {
  const ics = genererIcs(
    [
      {
        id: 'x1',
        titre: 'Chantier peinture, salon',
        lieu: '1 rue de l’Exemple; Villefictive',
        description: 'Apporter des gants\nPrévoir 3 heures',
        debut: new Date('2026-12-05T09:00:00Z'),
        fin: new Date('2026-12-05T12:00:00Z'),
        annule: false,
      },
    ],
    new Date('2026-11-20T10:00:00Z'),
  );

  it('produit un calendrier valide avec fins de ligne CRLF', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261205T090000Z');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('échappe virgules, points-virgules et retours à la ligne', () => {
    expect(ics).toContain('SUMMARY:Chantier peinture\\, salon');
    expect(ics).toContain('LOCATION:1 rue de l’Exemple\\; Villefictive');
    expect(ics).toContain('DESCRIPTION:Apporter des gants\\nPrévoir 3 heures');
  });

  it('replie les lignes trop longues', () => {
    const long = genererIcs([
      { id: 'x', titre: 'é'.repeat(80), lieu: null, description: null, debut: new Date(), fin: new Date(), annule: false },
    ]);
    for (const ligne of long.split('\r\n')) expect(Buffer.byteLength(ligne, 'utf8')).toBeLessThanOrEqual(75);
  });
});
