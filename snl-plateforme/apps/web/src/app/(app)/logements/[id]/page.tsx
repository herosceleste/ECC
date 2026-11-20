import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SectionDocuments } from '@/composants/documents';
import { BoutonEnvoi, Formulaire } from '@/composants/formulaire';
import { appelerApi, ErreurApi } from '@/lib/api';
import { chargerMoi, cheminsOrganisations, nomsOrganisations } from '@/lib/contexte';
import { LIBELLES_STATUTS_LOGEMENT, peut } from '@/lib/droits';
import { euros, CATEGORIES, STATUTS } from '@/lib/travaux';
import type { HistoriqueLogement, Immeuble, Logement } from '@/lib/types';
import { dateCourte } from '@/lib/format';
import { modifierLogement } from '../actions';
import { ChampsLogement } from '../champs';

export const metadata: Metadata = { title: 'Logement' };

export default async function FicheLogement({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, { cree }] = await Promise.all([params, searchParams]);
  let logement: Logement;
  try {
    logement = await appelerApi<Logement>(`/logements/${encodeURIComponent(id)}`);
  } catch (erreur) {
    if (erreur instanceof ErreurApi && [400, 404].includes(erreur.statut)) notFound();
    throw erreur;
  }
  const [moi, noms, chemins] = await Promise.all([chargerMoi(), nomsOrganisations(), cheminsOrganisations()]);
  const chemin = chemins.get(logement.organisationId);
  const modifier = peut(moi.adhesions, 'logement:ecrire', chemin);
  const deposer = peut(moi.adhesions, 'document:ecrire', chemin);
  const immeubles = modifier ? await appelerApi<Immeuble[]>('/immeubles') : [];
  // Historique des travaux (M1-F04), si le module est activé pour ce logement.
  const historique = peut(moi.adhesions, 'travaux:lire', chemin)
    ? await appelerApi<HistoriqueLogement>(`/travaux/logements/${logement.id}/historique`).catch((erreur: unknown) => {
        if (erreur instanceof ErreurApi && erreur.statut === 403) return null;
        throw erreur;
      })
    : null;

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/logements">Logements</Link> › {logement.reference}
      </nav>
      <div className="titre-page">
        <h1>Logement {logement.reference}</h1>
        <span className="badge">{LIBELLES_STATUTS_LOGEMENT[logement.statut]}</span>
      </div>
      {cree ? (
        <div className="alerte alerte-succes" role="status">
          <p>Le logement a été enregistré.</p>
        </div>
      ) : null}

      <div className="deux-colonnes">
        <div>
          <section className="carte" aria-labelledby="titre-description">
            <h2 id="titre-description">Description</h2>
            <dl className="liste-definitions">
              <dt>Groupe</dt>
              <dd>{noms.get(logement.organisationId) ?? '—'}</dd>
              <dt>Adresse</dt>
              <dd>
                {logement.immeuble
                  ? `${logement.immeuble.ligneAdresse}, ${logement.immeuble.codePostal} ${logement.immeuble.commune}`
                  : 'Non renseignée'}
              </dd>
              <dt>Typologie</dt>
              <dd>{logement.typologie}</dd>
              <dt>Surface</dt>
              <dd>{logement.surfaceM2 ? `${Number(logement.surfaceM2).toLocaleString('fr-FR')} m²` : '—'}</dd>
              <dt>Étage</dt>
              <dd>{logement.etage ?? '—'}</dd>
              <dt>Classe énergie</dt>
              <dd>{logement.classeDpe ?? '—'}</dd>
            </dl>
          </section>

          {modifier ? (
            <section className="carte" aria-labelledby="titre-modifier">
              <h2 id="titre-modifier">Modifier</h2>
              <Formulaire action={modifierLogement}>
                <input type="hidden" name="id" value={logement.id} />
                <ChampsLogement logement={logement} immeubles={immeubles} />
                <div className="actions">
                  <BoutonEnvoi>Enregistrer les modifications</BoutonEnvoi>
                </div>
              </Formulaire>
            </section>
          ) : null}
        </div>

        <div>
          {historique ? (
            <section className="carte" aria-labelledby="titre-travaux">
              <h2 id="titre-travaux">Travaux et entretien</h2>
              {peut(moi.adhesions, 'travaux:signaler', chemin) ? (
                <p>
                  <Link className="bouton bouton-secondaire" href={`/travaux/signaler?logement=${logement.id}`}>
                    Signaler un problème
                  </Link>
                </p>
              ) : null}
              {historique.interventions.length === 0 ? (
                <p className="aide">Aucune intervention enregistrée.</p>
              ) : (
                <ul>
                  {historique.interventions.map((i) => (
                    <li key={i.id}>
                      <Link href={`/travaux/${i.id}`}>{CATEGORIES[i.categorie] ?? i.categorie}</Link>
                      <span className="aide">
                        {' '}
                        · {dateCourte(i.creeLe)} · {STATUTS[i.statut]?.libelle.toLowerCase()}
                        {i.totaux && i.totaux.facturesCentimes > 0 ? ` · ${euros(i.totaux.facturesCentimes)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <p>
                Coût total facturé : <strong>{euros(historique.coutTotalCentimes)}</strong>
              </p>
              {historique.entretiens.length > 0 ? (
                <>
                  <h3>Entretiens programmés</h3>
                  <ul>
                    {historique.entretiens.map((e) => (
                      <li key={e.id}>
                        {e.libelle} <span className="aide">· prochaine échéance {dateCourte(e.prochaineEcheance)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>
          ) : null}
          <SectionDocuments
            entiteType="logement"
            entiteId={logement.id}
            page={`/logements/${logement.id}`}
            peutDeposer={deposer}
          />
        </div>
      </div>
    </>
  );
}
