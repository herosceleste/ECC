import type { Metadata } from 'next';
import Link from 'next/link';
import { chargerOrganisations } from '@/lib/contexte';
import { LIBELLES_TYPES } from '@/lib/droits';
import type { Organisation } from '@/lib/types';

export const metadata: Metadata = { title: 'Organisations' };

/** Arborescence visible : les racines sont les organisations dont le parent est hors périmètre. */
export default async function Organisations() {
  const organisations = await chargerOrganisations();
  const ids = new Set(organisations.map((o) => o.id));
  const racines = organisations.filter((o) => !o.parentId || !ids.has(o.parentId));

  return (
    <>
      <div className="titre-page">
        <h1>Organisations</h1>
      </div>
      <p className="chapo">Les organisations auxquelles vous avez accès, de l’association aux groupes locaux.</p>
      <div className="carte">
        {racines.length === 0 ? (
          <p className="etat-vide">Aucune organisation visible.</p>
        ) : (
          <ul className="arbre">
            {racines.map((o) => (
              <Noeud key={o.id} organisation={o} toutes={organisations} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Noeud({ organisation, toutes }: { organisation: Organisation; toutes: Organisation[] }) {
  const enfants = toutes.filter((o) => o.parentId === organisation.id);
  return (
    <li>
      <Link href={`/organisations/${organisation.id}`}>{organisation.nom}</Link>{' '}
      <span className="badge">{LIBELLES_TYPES[organisation.type]}</span>
      {enfants.length > 0 ? (
        <ul>
          {enfants.map((e) => (
            <Noeud key={e.id} organisation={e} toutes={toutes} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}
