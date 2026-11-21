import type { Metadata } from 'next';
import Link from 'next/link';
import { appelerApi } from '@/lib/api';
import { TYPES_ACTIVITE } from '@/lib/benevoles';
import { chargerMoi, nomsOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { heureCourte, jourLong } from '@/lib/format';
import type { Activite } from '@/lib/types';
import { ActionParticipation, EtatParticipation, MessageGeste, SousNavigationBenevoles } from './composants';

export const metadata: Metadata = { title: 'Planning des bénévoles' };

export default async function Planning({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ fait }, activites, moi, noms] = await Promise.all([
    searchParams,
    appelerApi<Activite[]>('/benevoles/activites'),
    chargerMoi(),
    nomsOrganisations(),
  ]);
  // Regroupement par jour, en heure de Paris.
  const parJour = new Map<string, Activite[]>();
  for (const a of activites) {
    const jour = jourLong(a.debut);
    parJour.set(jour, [...(parJour.get(jour) ?? []), a]);
  }

  return (
    <>
      <div className="titre-page">
        <h1>Bénévoles</h1>
        <div className="actions">
          <a className="bouton bouton-secondaire" href="/benevoles/agenda.ics" download>
            Ajouter à mon agenda
          </a>
          {peut(moi.adhesions, 'benevoles:gerer') ? (
            <Link className="bouton" href="/benevoles/activites/nouvelle">
              Proposer une activité
            </Link>
          ) : null}
        </div>
      </div>
      <SousNavigationBenevoles actif="planning" />
      <MessageGeste geste={fait} />

      {parJour.size === 0 ? (
        <div className="carte etat-vide">
          <p>Aucune activité prévue dans les deux prochains mois.</p>
        </div>
      ) : (
        [...parJour.entries()].map(([jour, liste]) => (
          <section key={jour} aria-label={jour}>
            <h2 style={{ textTransform: 'capitalize' }}>{jour}</h2>
            {liste.map((a) => (
              <article key={a.id} className="carte" aria-labelledby={`activite-${a.id}`}>
                <div className="titre-page" style={{ marginBottom: '0.5rem' }}>
                  <h3 id={`activite-${a.id}`} style={{ margin: 0 }}>
                    <Link href={`/benevoles/activites/${a.id}`}>{a.titre}</Link>
                  </h3>
                  <div className="actions">
                    <span className="badge">{TYPES_ACTIVITE[a.type] ?? a.type}</span>
                    {a.annuleeLe ? <span className="badge badge-erreur">Annulée</span> : null}
                    <EtatParticipation statut={a.monStatut} />
                  </div>
                </div>
                <p className="aide">
                  {heureCourte(a.debut)} – {heureCourte(a.fin)}
                  {a.lieu ? ` · ${a.lieu}` : ''} · {noms.get(a.organisationId) ?? ''} ·{' '}
                  {a.places ? `${a.inscrits}/${a.places} inscrits` : `${a.inscrits} inscrit${a.inscrits > 1 ? 's' : ''}`}
                  {a.enAttente ? ` · ${a.enAttente} en attente` : ''}
                </p>
                <ActionParticipation activite={a} retour="/benevoles" />
              </article>
            ))}
          </section>
        ))
      )}
    </>
  );
}
