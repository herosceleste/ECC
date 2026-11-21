import Link from 'next/link';

/**
 * Affiché à la place des données d'un ménage tant que l'engagement de
 * confidentialité n'est pas signé (règle M3-R01, critère M3-2).
 */
export function EngagementRequis({ retour }: { retour: string }) {
  return (
    <div className="carte" role="alert">
      <h1>Engagement de confidentialité</h1>
      <p>
        Les informations des ménages sont confidentielles. Avant de les consulter, lisez et signez l’engagement de
        confidentialité : cela prend deux minutes.
      </p>
      <Link className="bouton" href={`/integration/engagements?retour=${encodeURIComponent(retour)}`}>
        Lire et signer l’engagement
      </Link>
    </div>
  );
}
