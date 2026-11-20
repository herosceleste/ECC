'use client';

/** Erreur imprévue dans une page : message sobre et possibilité de réessayer. */
export default function ErreurPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="carte" role="alert">
      <h1>Un problème est survenu</h1>
      <p>La page n’a pas pu s’afficher. Vos données n’ont pas été modifiées.</p>
      <button type="button" className="bouton" onClick={reset}>
        Réessayer
      </button>
    </div>
  );
}
