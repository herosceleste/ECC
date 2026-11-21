import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Navigation, type LienNavigation } from '@/composants/navigation';
import { ErreurApi } from '@/lib/api';
import { chargerEspaces, chargerMoi, sessionCourante } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import type { Espace, Moi } from '@/lib/types';

export default async function MiseEnPageApplication({ children }: { children: ReactNode }) {
  const session = await sessionCourante();
  if (!session) redirect('/connexion');
  if (!session.associationId) redirect('/espaces');

  let moi: Moi;
  let espaces: Espace[];
  try {
    [moi, espaces] = await Promise.all([chargerMoi(), chargerEspaces()]);
  } catch (erreur) {
    if (erreur instanceof ErreurApi && erreur.statut === 403) return <AccesRefuse erreur={erreur} />;
    throw erreur;
  }

  const association = espaces.find((e) => e.tenant_id === session.associationId);
  const a = moi.adhesions;
  const liens: LienNavigation[] = [
    { href: '/accueil', libelle: 'Accueil' },
    { href: '/organisations', libelle: 'Organisations' },
    ...(peut(a, 'logement:lire') ? [{ href: '/logements', libelle: 'Logements' }] : []),
    ...(peut(a, 'menage:lire') ? [{ href: '/menages', libelle: 'Ménages' }] : []),
    ...(peut(a, 'travaux:lire') ? [{ href: '/travaux', libelle: 'Travaux' }] : []),
    ...(peut(a, 'benevoles:lire') ? [{ href: '/benevoles', libelle: 'Bénévoles' }] : []),
    ...(peut(a, 'accueil:lire') ? [{ href: '/integration', libelle: 'Intégration' }] : []),
    ...(peut(a, 'utilisateur:lire') ? [{ href: '/utilisateurs', libelle: 'Équipe' }] : []),
    ...(peut(a, 'audit:lire') ? [{ href: '/journal', libelle: 'Journal' }] : []),
  ];

  return (
    <>
      <header className="entete">
        <div className="entete-haut">
          <Link href="/accueil" className="marque">
            Plateforme SNL
            <small>{association?.association_nom ?? 'Association'}</small>
          </Link>
          <form action="/recherche" method="get" role="search" className="entete-recherche">
            <label htmlFor="recherche-globale" className="visuellement-masque">
              Rechercher un logement ou une personne
            </label>
            <input id="recherche-globale" name="q" type="search" minLength={2} placeholder="Logement, personne…" />
            <button type="submit" className="bouton bouton-secondaire">
              Rechercher
            </button>
          </form>
          <div className="entete-utilisateur">
            <span>{moi.nomAffiche}</span>
            {espaces.length > 0 && new Set(espaces.map((e) => e.tenant_id)).size > 1 ? (
              <Link href="/espaces">Changer d’espace</Link>
            ) : null}
            <form action="/auth/deconnexion" method="post">
              <button type="submit" className="bouton-lien">
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
        <Navigation liens={liens} />
      </header>
      <main id="contenu">{children}</main>
      <footer className="pied">Plateforme SNL · données hébergées dans l’Union européenne · accès journalisés</footer>
    </>
  );
}

function AccesRefuse({ erreur }: { erreur: ErreurApi }) {
  const secondFacteur = erreur.code === 'SECOND_FACTEUR_REQUIS';
  return (
    <main id="contenu" className="page-centree">
      <div className="carte">
        <h1>{secondFacteur ? 'Connexion renforcée nécessaire' : 'Accès impossible'}</h1>
        <div className="alerte alerte-attention" role="alert">
          <p>{erreur.message}</p>
        </div>
        {secondFacteur ? (
          <p>
            Votre rôle donne accès à des informations sensibles. Reconnectez-vous en utilisant votre application
            d’authentification (code à six chiffres).
          </p>
        ) : null}
        <div className="actions">
          <Link className="bouton bouton-secondaire" href="/espaces">
            Choisir un autre espace
          </Link>
          <form action="/auth/deconnexion" method="post">
            <button type="submit" className="bouton">
              Se reconnecter
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
