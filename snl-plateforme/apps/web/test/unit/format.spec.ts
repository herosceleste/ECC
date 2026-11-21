import { describe, expect, it } from 'vitest';
import { instantParis } from '@/lib/format';

describe('instantParis', () => {
  it('convertit l’heure d’hiver (UTC+1) et l’heure d’été (UTC+2)', () => {
    expect(instantParis('2026-01-15', '09:30')).toBe('2026-01-15T08:30:00.000Z');
    expect(instantParis('2026-07-14', '09:30')).toBe('2026-07-14T07:30:00.000Z');
  });

  it('gère les jours du changement d’heure', () => {
    expect(instantParis('2026-03-29', '12:00')).toBe('2026-03-29T10:00:00.000Z');
    expect(instantParis('2026-10-25', '12:00')).toBe('2026-10-25T11:00:00.000Z');
  });

  it('refuse une saisie invalide', () => {
    expect(instantParis('2026-13-45', '09:30')).toBeNull();
    expect(instantParis('2026-01-15', '9h30')).toBeNull();
    expect(instantParis(undefined, '09:30')).toBeNull();
  });
});
