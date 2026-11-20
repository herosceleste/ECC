import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SectionDocuments } from '@/composants/documents';
import { FormulairePersonne } from '@/composants/formulaire-personne';
import { appelerApi, ErreurApi } from '@/lib/api';
import { chargerMoi, cheminsOrganisations, nomsOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { dateCourte } from '@/lib/format';
import type { Menage } from '@/lib/types';
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
