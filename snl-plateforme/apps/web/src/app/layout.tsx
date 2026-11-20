import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Plateforme SNL', template: '%s · Plateforme SNL' },
  description: 'Plateforme des bénévoles et salariés de Solidarités Nouvelles pour le Logement.',
  robots: { index: false, follow: false },
};

/** Toutes les pages dépendent de la session : aucune n'est générée à l'avance. */
export const dynamic = 'force-dynamic';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function MiseEnPageRacine({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <a href="#contenu" className="lien-evitement">
          Aller au contenu
        </a>
        {children}
      </body>
    </html>
  );
}
