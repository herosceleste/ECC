import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SectionDocuments } from '@/composants/documents';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi, ErreurApi } from '@/lib/api';
import { chargerMoi, cheminsOrganisations, nomsOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { dateCourte } from '@/lib/format';
import type { Personne } from '@/lib/types';
import { enregistrerDonneesSensibles, modifierPersonne, supprimerPersonne } from '../../menages/actions';

export const metadata: Metadata = { title: 'Personne' };

interface DonneesSensibles {
  ressourcesMensuelles?: number | null;
  natureRessources?: string | null;
  situationProfessionnelle?: string | null;
}

export default async function FichePersonne({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, { sensibles }] = await Promise.all([params, searchParams]);
  let personne: Personne;
  try {
    personne = await appelerApi<Personne>(`/personnes/${encodeURIComponent(id)}`);
  } catch (erreur) {
    if (erreur instanceof ErreurApi && [400, 404].includes(erreur.statut)) notFound();
    throw erreur;
  }
  const [moi, noms, chemins] = await Promise.all([chargerMoi(), nomsOrganisations(), cheminsOrganisations()]);
  const chemin = chemins.get(personne.organisationId);
  const a = moi.adhesions;
  const ecrire = peut(a, 'personne:ecrire', chemin);
  const lireSensible = peut(a, 'personne:lire_sensible', chemin);

  // Les données sensibles ne sont chargées qu'à la demande explicite : chaque
  // consultation est journalisée, elle doit donc correspondre à un besoin réel.
  const donneesSensibles =
    lireSensible && sensibles === '1'
      ? (await appelerApi<{ donnees: DonneesSensibles | null }>(`/personnes/${personne.id}/donnees-sensibles`))
          .donnees
      : undefined;

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/menages">Ménages</Link>
        {personne.menageId ? (
          <>
            {' › '}
            <Link href={`/menages/${personne.menageId}`}>Ménage</Link>
          </>
        ) : null}
        {' › '}
        {personne.prenom} {personne.nom}
      </nav>
      <div className="titre-page">
        <h1>
          {personne.prenom} {personne.nom}
        </h1>
        <span className="badge">{noms.get(personne.organisationId) ?? 'Groupe'}</span>
      </div>

      <div className="deux-colonnes">
        <div>
          <section className="carte" aria-labelledby="titre-identite">
            <h2 id="titre-identite">Identité et contact</h2>
            {ecrire ? (
              <Formulaire action={modifierPersonne}>
                <input type="hidden" name="id" value={personne.id} />
                <div className="ligne-champs">
                  <Champ nom="prenom" libelle="Prénom" obligatoire valeur={personne.prenom} />
                  <Champ nom="nom" libelle="Nom" obligatoire valeur={personne.nom} />
                </div>
                <div className="ligne-champs">
                  <Champ
                    nom="dateNaissance"
                    libelle="Date de naissance"
                    type="date"
                    valeur={personne.dateNaissance?.slice(0, 10)}
                  />
                  <Champ nom="telephone" libelle="Téléphone" type="tel" valeur={personne.telephone} />
                  <Champ nom="email" libelle="Courriel" type="email" valeur={personne.email} />
                </div>
                <div className="actions">
                  <BoutonEnvoi>Enregistrer</BoutonEnvoi>
                </div>
              </Formulaire>
            ) : (
              <dl className="liste-definitions">
                <dt>Date de naissance</dt>
                <dd>{dateCourte(personne.dateNaissance)}</dd>
                <dt>Téléphone</dt>
                <dd>{personne.telephone ?? '—'}</dd>
                <dt>Courriel</dt>
                <dd>{personne.email ?? '—'}</dd>
              </dl>
            )}
          </section>

          {lireSensible ? (
            <section className="carte" aria-labelledby="titre-sensible">
              <h2 id="titre-sensible">Situation sociale et ressources</h2>
              <p className="aide">
                Informations chiffrées, réservées aux travailleurs sociaux. Chaque consultation est enregistrée dans le
                journal d’audit.
              </p>
              {donneesSensibles === undefined ? (
                <Link className="bouton bouton-secondaire" href={`/personnes/${personne.id}?sensibles=1`}>
                  Afficher les informations
                </Link>
              ) : (
                <Formulaire action={enregistrerDonneesSensibles}>
                  <input type="hidden" name="id" value={personne.id} />
                  <Champ
                    nom="ressourcesMensuelles"
                    libelle="Ressources mensuelles (€)"
                    modeSaisie="decimal"
                    valeur={donneesSensibles?.ressourcesMensuelles ?? undefined}
                  />
                  <Champ
                    nom="natureRessources"
                    libelle="Nature des ressources"
                    valeur={donneesSensibles?.natureRessources ?? undefined}
                    aide="Ex. : salaire, allocation, pension."
                  />
                  <Champ
                    nom="situationProfessionnelle"
                    libelle="Situation professionnelle"
                    valeur={donneesSensibles?.situationProfessionnelle ?? undefined}
                  />
                  <div className="actions">
                    <BoutonEnvoi>Enregistrer</BoutonEnvoi>
                    <Link href={`/personnes/${personne.id}`}>Masquer</Link>
                  </div>
                </Formulaire>
              )}
            </section>
          ) : null}
        </div>

        <div>
          <SectionDocuments
            entiteType="personne"
            entiteId={personne.id}
            page={`/personnes/${personne.id}`}
            peutDeposer={peut(a, 'document:ecrire', chemin)}
          />

          {peut(a, 'rgpd:traiter', chemin) ? (
            <section className="carte" aria-labelledby="titre-droits">
              <h2 id="titre-droits">Droits de la personne</h2>
              <p className="aide">Export complet de ses données, à remettre à la personne qui en fait la demande.</p>
              <a className="bouton bouton-secondaire" href={`/personnes/${personne.id}/export`}>
                Exporter ses données
              </a>
            </section>
          ) : null}

          {ecrire ? (
            <section className="carte" aria-labelledby="titre-suppression">
              <h2 id="titre-suppression">Supprimer la fiche</h2>
              <Formulaire action={supprimerPersonne}>
                <input type="hidden" name="id" value={personne.id} />
                <input type="hidden" name="menageId" value={personne.menageId ?? ''} />
                <p className="aide">La fiche disparaît aussitôt et sera effacée définitivement après 30 jours.</p>
                <label className="case">
                  <input type="checkbox" name="confirmation" value="oui" />
                  Je confirme la suppression de cette fiche
                </label>
                <div className="actions">
                  <BoutonEnvoi variante="danger">Supprimer</BoutonEnvoi>
                </div>
              </Formulaire>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
