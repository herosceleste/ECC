import Link from 'next/link';

export default function Introuvable() {
  return (
    <main id="contenu" className="page-centree">
      <div className="carte">
        <h1>Page introuvable</h1>
        <p>Cette page n’existe pas, ou vous n’avez pas accès à son contenu.</p>
        <Link className="bouton" href="/">
          Revenir à l’accueil
        </Link>
      </div>
    </main>
  );
}
