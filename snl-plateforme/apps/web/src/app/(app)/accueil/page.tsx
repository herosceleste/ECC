import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { appelerApi } from '@/lib/api';
import type { MonParcours } from '@/lib/types';
import { chargerMoi, nomsOrganisations } from '@/lib/contexte';
import { LIBELLES_ROLES, peut } from '@/lib/droits';

export const metadata: Metadata = { title: 'Accueil' };

export default async function Accueil({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [moi, noms, { ignorer }] = await Promise.all([chargerMoi(), nomsOrganisations(), searchParams]);
  const a = moi.adhesions;

  // Critère M3-1 : un nouveau bénévole qui n'a encore rien commencé arrive sur son parcours.
  const nouveauBenevole = a.some((x) => x.role === 'BENEVOLE') && !peut(a, 'accueil:editer');
  if (nouveauBenevole && !ignorer) {
    const parcours = await appelerApi<MonParcours>('/integration/mon-parcours').catch(() => null);
    if (parcours?.actif && parcours.etapes.length > 0 && parcours.nombreTerminees === 0) redirect('/integration');
  }

  const raccourcis = [
    peut(a, 'logement:lire') && {
      href: '/logements',
      titre: 'Logements',
      texte: 'Consulter le parc, son état et ses documents.',
    },
    peut(a, 'logement:ecrire') && {
      href: '/logements/nouveau',
      titre: 'Ajouter un logement',
      texte: 'Enregistrer un logement entrant dans le parc.',
    },
    peut(a, 'menage:lire') && {
      href: '/menages',
      titre: 'Ménages',
      texte: 'Retrouver les ménages accompagnés et leurs membres.',
    },
    peut(a, 'utilisateur:gerer') && {
      href: '/utilisateurs',
      titre: 'Inviter un bénévole',
      texte: 'Ouvrir un accès à un nouveau membre de l’équipe.',
    },
    { href: '/organisations', titre: 'Organisations', texte: 'Voir l’antenne et les groupes locaux.' },
  ].filter((r): r is { href: string; titre: string; texte: string } => Boolean(r));

  return (
    <>
      <div className="titre-page">
        <h1>Bonjour {moi.nomAffiche}</h1>
      </div>

      <section className="carte" aria-labelledby="titre-roles">
        <h2 id="titre-roles">Vos rôles</h2>
        <ul>
          {a.map((adhesion) => (
            <li key={`${adhesion.organisationId}-${adhesion.role}`}>
              <strong>{LIBELLES_ROLES[adhesion.role] ?? adhesion.role}</strong> ·{' '}
              {noms.get(adhesion.organisationId) ?? 'organisation'}
            </li>
          ))}
        </ul>
      </section>

      <h2>Accès rapides</h2>
      <div className="grille">
        {raccourcis.map((r) => (
          <Link key={r.href} href={r.href} className="carte carte-lien">
            <h3>{r.titre}</h3>
            <p className="aide">{r.texte}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
