import type { Metadata } from 'next';
import Link from 'next/link';
import { appelerApi } from '@/lib/api';
import { nomsOrganisations } from '@/lib/contexte';

export const metadata: Metadata = { title: 'Recherche' };

interface Resultats {
  logements: { id: string; reference: string; typologie: string; organisationId: string }[];
  personnes: { id: string; nom: string; prenom: string; organisationId: string }[];
}

export default async function Recherche({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = ((await searchParams).q ?? '').trim();
  if (q.length < 2) {
    return (
      <div className="carte">
        <h1>Recherche</h1>
        <p>Saisissez au moins deux caractères dans le champ de recherche.</p>
      </div>
    );
  }
  const [resultats, noms] = await Promise.all([
    appelerApi<Resultats>(`/recherche?q=${encodeURIComponent(q)}`),
    nomsOrganisations(),
  ]);
  const total = resultats.logements.length + resultats.personnes.length;

  return (
    <>
      <h1>Résultats pour « {q} »</h1>
      <p role="status" className="chapo">
        {total === 0 ? 'Aucun résultat dans votre périmètre.' : `${total} résultat${total > 1 ? 's' : ''}.`}
      </p>
      <div className="grille">
        {resultats.logements.length > 0 ? (
          <section className="carte" aria-labelledby="titre-res-logements">
            <h2 id="titre-res-logements">Logements</h2>
            <ul>
              {resultats.logements.map((l) => (
                <li key={l.id}>
                  <Link href={`/logements/${l.id}`}>{l.reference}</Link>{' '}
                  <span className="aide">
                    {l.typologie} · {noms.get(l.organisationId) ?? ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {resultats.personnes.length > 0 ? (
          <section className="carte" aria-labelledby="titre-res-personnes">
            <h2 id="titre-res-personnes">Personnes</h2>
            <ul>
              {resultats.personnes.map((p) => (
                <li key={p.id}>
                  <Link href={`/personnes/${p.id}`}>
                    {p.prenom} {p.nom}
                  </Link>{' '}
                  <span className="aide">{noms.get(p.organisationId) ?? ''}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
