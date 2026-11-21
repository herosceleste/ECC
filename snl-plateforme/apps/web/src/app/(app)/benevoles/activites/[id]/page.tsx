import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BoutonEnvoi, Formulaire } from '@/composants/formulaire';
import { appelerApi, ErreurApi } from '@/lib/api';
import { TYPES_ACTIVITE } from '@/lib/benevoles';
import { heureCourte, jourLong } from '@/lib/format';
import type { ActiviteDetail } from '@/lib/types';
import { agirSurActivite } from '../../actions';
import { ActionParticipation, EtatParticipation, MessageGeste } from '../../composants';

export const metadata: Metadata = { title: 'Activité' };

export default async function FicheActivite({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, { fait, cree }] = await Promise.all([params, searchParams]);
  let activite: ActiviteDetail;
  try {
    activite = await appelerApi<ActiviteDetail>(`/benevoles/activites/${encodeURIComponent(id)}`);
  } catch (erreur) {
    if (erreur instanceof ErreurApi && [400, 403, 404].includes(erreur.statut)) notFound();
    throw erreur;
  }
  const inscrits = activite.inscriptions.filter((i) => i.statut === 'INSCRIT');
  const attente = activite.inscriptions.filter((i) => i.statut === 'LISTE_ATTENTE');
  const avenir = new Date(activite.debut) > new Date();

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/benevoles">Bénévoles</Link> › {activite.titre}
      </nav>
      <div className="titre-page">
        <h1>{activite.titre}</h1>
        <div className="actions">
          <span className="badge">{TYPES_ACTIVITE[activite.type] ?? activite.type}</span>
          {activite.annuleeLe ? <span className="badge badge-erreur">Annulée</span> : null}
          <EtatParticipation statut={activite.monStatut} />
        </div>
      </div>
      {cree ? (
        <div className="alerte alerte-succes" role="status">
          <p>L’activité est publiée dans le planning du groupe.</p>
        </div>
      ) : null}
      <MessageGeste geste={fait} />

      <div className="deux-colonnes">
        <div>
          <section className="carte" aria-labelledby="titre-infos">
            <h2 id="titre-infos">Informations</h2>
            <dl className="liste-definitions">
              <dt>Quand</dt>
              <dd style={{ textTransform: 'capitalize' }}>
                {jourLong(activite.debut)}, {heureCourte(activite.debut)} – {heureCourte(activite.fin)}
              </dd>
              <dt>Où</dt>
              <dd>{activite.lieu ?? '—'}</dd>
              <dt>Places</dt>
              <dd>{activite.places ? `${activite.inscrits} sur ${activite.places}` : `${activite.inscrits} inscrit(s), sans limite`}</dd>
              <dt>Proposée par</dt>
              <dd>{activite.creeParNom}</dd>
              {activite.interventionId ? (
                <>
                  <dt>Intervention</dt>
                  <dd>
                    <Link href={`/travaux/${activite.interventionId}`}>Voir le signalement lié</Link>
                  </dd>
                </>
              ) : null}
            </dl>
            {activite.description ? <p style={{ whiteSpace: 'pre-line', marginTop: '1rem' }}>{activite.description}</p> : null}
            {activite.droits.participer ? <ActionParticipation activite={activite} retour={`/benevoles/activites/${activite.id}`} /> : null}
          </section>

          {activite.droits.gerer && avenir && !activite.annuleeLe ? (
            <section className="carte" aria-labelledby="titre-annuler">
              <h2 id="titre-annuler">Annuler l’activité</h2>
              <p className="aide">Les personnes inscrites et en attente seront prévenues par courriel.</p>
              <Formulaire action={agirSurActivite} libelle="Annuler l’activité">
                <input type="hidden" name="id" value={activite.id} />
                <input type="hidden" name="geste" value="annuler" />
                <BoutonEnvoi variante="danger">Annuler l’activité</BoutonEnvoi>
              </Formulaire>
            </section>
          ) : null}
        </div>

        <section className="carte" aria-labelledby="titre-participants">
          <h2 id="titre-participants">Participants</h2>
          {inscrits.length === 0 ? (
            <p className="aide">Personne n’est encore inscrit.</p>
          ) : (
            <ul>
              {inscrits.map((i) => (
                <li key={i.utilisateurId}>{i.nomAffiche}</li>
              ))}
            </ul>
          )}
          {attente.length > 0 ? (
            <>
              <h3>Liste d’attente</h3>
              <ol>
                {attente.map((i) => (
                  <li key={i.utilisateurId}>{i.nomAffiche}</li>
                ))}
              </ol>
            </>
          ) : null}
        </section>
      </div>
    </>
  );
}
