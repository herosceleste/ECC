import Link from 'next/link';

/** Onglets du module Travaux. */
export function SousNavigation({ actif }: { actif: 'signalements' | 'entretiens' | 'artisans' }) {
  const onglets = [
    { cle: 'signalements', href: '/travaux', libelle: 'Signalements' },
    { cle: 'entretiens', href: '/travaux/entretiens', libelle: 'Entretiens à prévoir' },
    { cle: 'artisans', href: '/travaux/artisans', libelle: 'Artisans' },
  ] as const;
  return (
    <nav aria-label="Rubriques des travaux" className="actions" style={{ marginBottom: '1rem' }}>
      {onglets.map((o) => (
        <Link
          key={o.cle}
          href={o.href}
          aria-current={o.cle === actif ? 'page' : undefined}
          className={`bouton ${o.cle === actif ? '' : 'bouton-secondaire'}`}
        >
          {o.libelle}
        </Link>
      ))}
    </nav>
  );
}
