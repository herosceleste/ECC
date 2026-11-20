import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi, ErreurApi } from '@/lib/api';
import { chargerMoi, chargerOrganisations } from '@/lib/contexte';
import { LIBELLES_TYPES, peut } from '@/lib/droits';
import type { EtatModule, Organisation } from '@/lib/types';
import { creerOrganisation, definirModule, renommerOrganisation } from '../actions';

export const metadata: Metadata = { title: 'Organisation' };

const ENFANTS: Record<string, { valeur: string; libelle: string }[]> = {
  ASSOCIATION: [
    { valeur: 'ANTENNE', libelle: 'Antenne' },
    { valeur: 'GROUPE_LOCAL', libelle: 'Groupe local' },
  ],
  ANTENNE: [{ valeur: 'GROUPE_LOCAL', libelle: 'Groupe local' }],
  GROUPE_LOCAL: [],
};

export default async function FicheOrganisation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let organisation: Organisation;
  let modules: EtatModule[];
  try {
    [organisation, modules] = await Promise.all([
      appelerApi<Organisation>(`/organisations/${id}`),
      appelerApi<EtatModule[]>(`/organisations/${id}/modules`),
    ]);
  } catch (erreur) {
    if (erreur instanceof ErreurApi && [400, 404].includes(erreur.statut)) notFound();
    throw erreur;
  }
  const [moi, toutes] = await Promise.all([chargerMoi(), chargerOrganisations()]);
  const gerer = peut(moi.adhesions, 'organisation:gerer', organisation.chemin);
  const gererModules = peut(moi.adhesions, 'module:gerer', organisation.chemin);
  const enfants = toutes.filter((o) => o.parentId === organisation.id);
  const parent = toutes.find((o) => o.id === organisation.parentId);
  const typesEnfants = ENFANTS[organisation.type] ?? [];

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/organisations">Organisations</Link>
        {parent ? (
          <>
            {' › '}
            <Link href={`/organisations/${parent.id}`}>{parent.nom}</Link>
          </>
        ) : null}
      </nav>
      <div className="titre-page">
        <h1>{organisation.nom}</h1>
        <span className="badge">{LIBELLES_TYPES[organisation.type]}</span>
      </div>

      <div className="deux-colonnes">
        <div>
          <section className="carte" aria-labelledby="titre-modules">
            <h2 id="titre-modules">Modules</h2>
            <p className="aide">
              Un module activé sur une organisation l’est aussi pour celles qui en dépendent, sauf réglage contraire.
            </p>
            <div className="tableau-conteneur">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Module</th>
                    <th scope="col">État</th>
                    {gererModules ? <th scope="col">Action</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {modules.map((m) => (
                    <tr key={m.code}>
                      <td>
                        <strong>{m.code}</strong> {m.libelle}
                      </td>
                      <td>
                        <span className={`badge ${m.active ? 'badge-succes' : ''}`}>
                          {m.active ? 'Activé' : 'Désactivé'}
                        </span>
                        {m.regleSur && m.regleSur !== organisation.id ? (
                          <span className="aide"> (hérité)</span>
                        ) : null}
                      </td>
                      {gererModules ? (
                        <td>
                          <Formulaire action={definirModule} libelle={`Module ${m.code}`}>
                            <input type="hidden" name="organisationId" value={organisation.id} />
                            <input type="hidden" name="code" value={m.code} />
                            <input type="hidden" name="active" value={m.active ? 'non' : 'oui'} />
                            <BoutonEnvoi variante="secondaire">{m.active ? 'Désactiver' : 'Activer'}</BoutonEnvoi>
                          </Formulaire>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div>
          {enfants.length > 0 ? (
            <section className="carte" aria-labelledby="titre-enfants">
              <h2 id="titre-enfants">Rattachées</h2>
              <ul>
                {enfants.map((e) => (
                  <li key={e.id}>
                    <Link href={`/organisations/${e.id}`}>{e.nom}</Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {gerer && typesEnfants.length > 0 ? (
            <section className="carte" aria-labelledby="titre-creer">
              <h2 id="titre-creer">Ajouter une organisation</h2>
              <Formulaire action={creerOrganisation} viderApresSucces>
                <input type="hidden" name="parentId" value={organisation.id} />
                <Champ nom="type" libelle="Type" obligatoire options={typesEnfants} />
                <Champ nom="nom" libelle="Nom" obligatoire />
                <Champ
                  nom="slug"
                  libelle="Identifiant court"
                  aide="Minuscules et tirets. Laissé vide, il est déduit du nom."
                />
                <div className="actions">
                  <BoutonEnvoi>Créer</BoutonEnvoi>
                </div>
              </Formulaire>
            </section>
          ) : null}

          {gerer ? (
            <section className="carte" aria-labelledby="titre-renommer">
              <h2 id="titre-renommer">Renommer</h2>
              <Formulaire action={renommerOrganisation}>
                <input type="hidden" name="id" value={organisation.id} />
                <Champ nom="nom" libelle="Nouveau nom" obligatoire valeur={organisation.nom} />
                <div className="actions">
                  <BoutonEnvoi variante="secondaire">Enregistrer</BoutonEnvoi>
                </div>
              </Formulaire>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
