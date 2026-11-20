'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface LienNavigation {
  href: string;
  libelle: string;
}

/** Barre de navigation ; la page courante est signalée aux technologies d'assistance. */
export function Navigation({ liens }: { liens: LienNavigation[] }) {
  const chemin = usePathname();
  return (
    <nav className="navigation" aria-label="Navigation principale">
      <ul>
        {liens.map((lien) => {
          const actif = chemin === lien.href || chemin.startsWith(`${lien.href}/`);
          return (
            <li key={lien.href}>
              <Link href={lien.href} aria-current={actif ? 'page' : undefined}>
                {lien.libelle}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
