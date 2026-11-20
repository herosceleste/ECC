import type { Metadata } from 'next';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi } from '@/lib/api';
import { chargerMoi, chargerOrganisations, nomsOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { CATEGORIES } from '@/lib/travaux';
import type { Artisan } from '@/lib/types';
import { creerArtisan } from '../actions';
import { SousNavigation } from '../sous-navigation';

export const metadata: Metadata = { title: 'Artisans' };

export default async function Artisans() {
  const [artisans, moi, organisations, noms] = await Promise.all([
    appelerApi<Artisan[]>('/travaux/artisans'),
    chargerMoi(),
    chargerOrganisations(),
    nomsOrganisations(),
  ]);
  const gerables = organisations
    .filter((o) => peut(moi.adhesions, 'artisan:gerer', o.chemin))
    .map((o) => ({ valeur: o.id, libelle: o.nom }));

  return (
    <>
      <div className="titre-page">
        <h1>Travaux et entretien</h1>
      </div>
      <SousNavigation actif="artisans" />
      <div className={gerables.length > 0 ? 'deux-colonnes' : undefined}>
        <section aria-labelledby="titre-carnet">
          <h2 id="titre-carnet">Carnet d’artisans</h2>
          <p className="aide">Un artisan enregistré par une antenne est proposé à tous ses groupes locaux.</p>
          {artisans.length === 0 ? (
            <div className="carte etat-vide">
              <p>Aucun artisan enregistré.</p>
            </div>
          ) : (
            <div className="tableau-conteneur">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Artisan</th>
                    <th scope="col">Spécialités</th>
                    <th scope="col">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {artisans.map((a) => (
                    <tr key={a.id}>
                      <th scope="row">
                        {a.raisonSociale}
                        {a.actif ? null : <span className="badge"> inactif</span>}
                        <br />
                        <span className="aide">
                          {noms.get(a.organisationId) ?? ''}
                          {a.siret ? ` · SIRET ${a.siret}` : ''}
                        </span>
                      </th>
                      <td>{a.specialites.map((s) => CATEGORIES[s] ?? s).join(', ') || '—'}</td>
                      <td>
                        {a.telephone ? <a href={`tel:${a.telephone.replace(/\s/g, '')}`}>{a.telephone}</a> : null}
                        {a.telephone && a.email ? <br /> : null}
                        {a.email ? <a href={`mailto:${a.email}`}>{a.email}</a> : null}
                        {!a.telephone && !a.email ? '—' : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {gerables.length > 0 ? (
          <section className="carte" aria-labelledby="titre-ajout-artisan">
            <h2 id="titre-ajout-artisan">Ajouter un artisan</h2>
            <Formulaire action={creerArtisan} viderApresSucces>
              <Champ nom="organisationId" libelle="Rattaché à" obligatoire options={gerables} />
              <Champ nom="raisonSociale" libelle="Nom de l’entreprise" obligatoire />
              <Champ nom="siret" libelle="SIRET" modeSaisie="numeric" aide="14 chiffres, sur le devis ou la facture." />
              <fieldset className="champ">
                <legend>Spécialités</legend>
                {Object.entries(CATEGORIES).map(([valeur, libelle]) => (
                  <label key={valeur} className="case">
                    <input type="checkbox" name="specialites" value={valeur} />
                    {libelle}
                  </label>
                ))}
              </fieldset>
              <Champ nom="telephone" libelle="Téléphone" type="tel" />
              <Champ nom="email" libelle="Courriel" type="email" />
              <div className="actions">
                <BoutonEnvoi>Ajouter au carnet</BoutonEnvoi>
              </div>
            </Formulaire>
          </section>
        ) : null}
      </div>
    </>
  );
}
