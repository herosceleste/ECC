import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SectionDocuments } from '@/composants/documents';
import { FormulairePersonne } from '@/composants/formulaire-personne';
import { appelerApi, ErreurApi } from '@/lib/api';
import { chargerMoi, cheminsOrganisations, nomsOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { dateCourte } from '@/lib/format';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import type { Menage, MembreAnnuaire, Referent } from '@/lib/types';
import { ajouterReferent, retirerReferent } from '../../benevoles/actions';
import { ajouterPersonne } from '../actions';

export const metadata: Metadata = { title: 'Ménage' };

export default async function FicheMenage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ id }, { supprime }] = await Promise.all([params, searchParams]);
  let menage: Menage;
  try {
    menage = await appelerApi<Menage>(`/menages/${encodeURIComponent(id)}`);
  } catch (erreur) {
    if (erreur instanceof ErreurApi && [400, 404].includes(erreur.statut)) notFound();
    throw erreur;
  }
  const [moi, noms, chemins] = await Promise.all([chargerMoi(), nomsOrganisations(), cheminsOrganisations()]);
  const chemin = chemins.get(menage.organisationId);
  const personnes = menage.personnes ?? [];
  // Bénévoles référents (module M2), si le module est activé pour ce ménage.
  const referents = peut(moi.adhesions, 'benevoles:lire', chemin)
    ? await appelerApi<Referent[]>(`/benevoles/menages/${menage.id}/referents`).catch((erreur: unknown) => {
        if (erreur instanceof ErreurApi && erreur.statut === 403) return null;
        throw erreur;
      })
    : null;
  const gererReferents = referents !== null && peut(moi.adhesions, 'benevoles:gerer', chemin);
  const candidats = gererReferents
    ? (await appelerApi<MembreAnnuaire[]>('/benevoles/annuaire')).filter(
        (m) => m.statut === 'ACTIF' && !referents.some((r) => r.utilisateurId === m.id),
      )
    : [];

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/menages">Ménages</Link> › {menage.libelle}
      </nav>
      <div className="titre-page">
        <h1>{menage.libelle}</h1>
        <span className="badge">{noms.get(menage.organisationId) ?? 'Groupe'}</span>
      </div>
      {supprime ? (
        <div className="alerte alerte-succes" role="status">
          <p>La fiche a été supprimée. Elle sera effacée définitivement dans 30 jours.</p>
        </div>
      ) : null}

      <div className="deux-colonnes">
        <div>
          <section className="carte" aria-labelledby="titre-membres">
            <h2 id="titre-membres">Membres du ménage</h2>
            {personnes.length === 0 ? (
              <p className="aide">Aucune personne enregistrée.</p>
            ) : (
              <div className="tableau-conteneur">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Personne</th>
                      <th scope="col">Date de naissance</th>
                      <th scope="col">Téléphone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {personnes.map((p) => (
                      <tr key={p.id}>
                        <th scope="row">
                          <Link href={`/personnes/${p.id}`}>
                            {p.prenom} {p.nom}
                          </Link>
                        </th>
                        <td>{dateCourte(p.dateNaissance)}</td>
                        <td>{p.telephone ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {peut(moi.adhesions, 'personne:ecrire', chemin) ? (
            <section className="carte" aria-labelledby="titre-ajout">
              <h2 id="titre-ajout">Ajouter une personne</h2>
              <FormulairePersonne action={ajouterPersonne} organisationId={menage.organisationId} menageId={menage.id} />
            </section>
          ) : null}
        </div>
        <div>
          {referents ? (
            <section className="carte" aria-labelledby="titre-referents">
              <h2 id="titre-referents">Bénévoles référents</h2>
              <p className="aide">Ils voient le nom et les coordonnées du ménage, jamais sa situation sociale.</p>
              {referents.length === 0 ? (
                <p className="aide">Aucun référent pour le moment.</p>
              ) : (
                <ul>
                  {referents.map((r) => (
                    <li key={r.id}>
                      {r.nomAffiche}
                      {gererReferents ? (
                        <Formulaire action={retirerReferent} libelle={`Retirer ${r.nomAffiche}`}>
                          <input type="hidden" name="id" value={r.id} />
                          <input type="hidden" name="menageId" value={menage.id} />
                          <BoutonEnvoi variante="secondaire">Retirer</BoutonEnvoi>
                        </Formulaire>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {gererReferents && candidats.length > 0 ? (
                <Formulaire action={ajouterReferent} libelle="Ajouter un référent">
                  <input type="hidden" name="menageId" value={menage.id} />
                  <Champ
                    nom="utilisateurId"
                    libelle="Ajouter un référent"
                    obligatoire
                    options={candidats.map((c) => ({ valeur: c.id, libelle: c.nomAffiche }))}
                  />
                  <div className="actions">
                    <BoutonEnvoi variante="secondaire">Ajouter</BoutonEnvoi>
                  </div>
                </Formulaire>
              ) : null}
            </section>
          ) : null}
          <SectionDocuments
            entiteType="menage"
            entiteId={menage.id}
            page={`/menages/${menage.id}`}
            peutDeposer={peut(moi.adhesions, 'document:ecrire', chemin)}
          />
        </div>
      </div>
    </>
  );
}
