/** Mises en forme françaises partagées par les pages. */

export function dateCourte(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(iso));
}

export function dateHeure(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(new Date(iso));
}

export function taille(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`;
}

/** « Groupe local de Massy ! » → « groupe-local-de-massy ». */
export function identifiantCourt(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * « 2026-07-14 » + « 09:30 » saisis en heure de Paris → instant ISO (UTC),
 * en tenant compte de l'heure d'été. Renvoie null si la saisie est invalide.
 */
export function instantParis(date: string | undefined, heure: string | undefined): string | null {
  if (!date || !heure || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(heure)) return null;
  const supposeUtc = new Date(`${date}T${heure}:00Z`);
  if (Number.isNaN(supposeUtc.getTime())) return null;
  // Décalage de Paris à cet instant (une ou deux heures), calculé par Intl.
  const decalage = (instant: Date) => {
    const parties = Object.fromEntries(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Paris',
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
        .formatToParts(instant)
        .map((p) => [p.type, p.value]),
    );
    const vuDeParis = Date.UTC(+parties.year!, +parties.month! - 1, +parties.day!, +parties.hour!, +parties.minute!);
    return vuDeParis - instant.getTime();
  };
  const premier = new Date(supposeUtc.getTime() - decalage(supposeUtc));
  return new Date(supposeUtc.getTime() - decalage(premier)).toISOString();
}

export function heureCourte(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(iso));
}

export function jourLong(iso: string): string {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'Europe/Paris' }).format(new Date(iso));
}
