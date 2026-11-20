import type { Metadata } from 'next';
import Link from 'next/link';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi } from '@/lib/api';
import { chargerMoi, cheminsOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { dateCourte } from '@/lib/format';
import { CATEGORIES, options } from '@/lib/travaux';
import type { EntretienPeriodique, Logement } from '@/lib/types';
import { creerEntretien, entretienRealise, lancerEntretien } from '../actions';
import { SousNavigation } from '../sous-navigation';

export const metadata: Metadata = { title: 'Entretiens à prévoir' };

const PERIODICITES = [
  { valeur: '6', libelle: 'Tous les 6 mois' },
  { valeur: '12', libelle: 'Tous les ans' },
  { valeur: '24', libelle: 'Tous les 2 ans' },
  { valeur: '36', libelle: 'Tous les 3 ans' },
  { valeur: '60', libelle: 'Tous les 5 ans' },
];

export default async function Entretiens() {
  const [echeances, logements, moi, chemins] = await Promise.all([
    appelerApi<EntretienPeriodique[]>('/travaux/entretiens?jours=60'),
    appelerApi<Logement[]>('/logements'),
    chargerMoi(),
    cheminsOrganisations(),
  ]);
  const gerables = logements
    .filter((l) => peut(moi.adhesions, 'travaux:gerer', chemins.get(l.organisationId)))
    .map((l) => ({ valeur: l.id, libelle: l.reference }));
  const peutGerer = gerables.length > 0;
  const aujourdhui = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div className="titre-page">
        <h1>Travaux et entretien</h1>
      </div>
      <SousNavigation actif="entretiens" />
      <div className={peutGerer ? 'deux-colonnes' : undefined}>
        <section aria-labelledby="titre-echeances">
          <h2 id="titre-echeances">Échéances des 60 prochains jours</h2>
          {echeances.length === 0 ? (
            <div className="carte etat-vide">
              <p>Aucun entretien à prévoir dans les 60 prochains jours.</p>
            </div>
          ) : (
            <div className="tableau-conteneur">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Entretien</th>
                    <th scope="col">Logement</th>
                    <th scope="col">Échéance</th>
                    {peutGerer ? <th scope="col">Actions</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {echeances.map((e) => {
                    const depasse = e.prochaineEcheance.slice(0, 10) < aujourdhui;
                    return (
                      <tr key={e.id}>
                        <th scope="row">
                          {e.libelle}
                          <br />
                          <span className="aide">
                            {CATEGORIES[e.categorie]} · dernière fois : {dateCourte(e.derniereRealisation)}
                          </span>
                        </th>
                        <td>{e.logement ? <Link href={`/logements/${e.logement.id}`}>{e.logement.reference}</Link> : '—'}</td>
                        <td>
                          {dateCourte(e.prochaineEcheance)}
                          {depasse ? <span className="badge badge-erreur"> dépassée</span> : null}
                        </td>
                        {peutGerer ? (
                          <td>
                            <div className="actions">
                              <Formulaire action={lancerEntretien} libelle={`Créer l’intervention : ${e.libelle}`}>
                                <input type="hidden" name="id" value={e.id} />
                                <BoutonEnvoi variante="secondaire">Créer l’intervention</BoutonEnvoi>
                              </Formulaire>
                              <Formulaire action={entretienRealise} libelle={`Marquer réalisé : ${e.libelle}`}>
                                <input type="hidden" name="id" value={e.id} />
                                <input type="hidden" name="date" value={aujourdhui} />
                                <BoutonEnvoi variante="secondaire">Fait aujourd’hui</BoutonEnvoi>
                              </Formulaire>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {peutGerer ? (
          <section className="carte" aria-labelledby="titre-programmer">
            <h2 id="titre-programmer">Programmer un entretien</h2>
            <Formulaire action={creerEntretien} viderApresSucces>
              <Champ nom="logementId" libelle="Logement" obligatoire options={gerables} />
              <Champ nom="libelle" libelle="Entretien" obligatoire aide="Ex. : entretien annuel de la chaudière" />
              <Champ nom="categorie" libelle="Type" obligatoire options={options(CATEGORIES)} valeur="CHAUFFAGE" />
              <Champ nom="periodiciteMois" libelle="Fréquence" obligatoire options={PERIODICITES} valeur="12" />
              <Champ nom="prochaineEcheance" libelle="Prochaine échéance" type="date" obligatoire />
              <div className="actions">
                <BoutonEnvoi>Programmer</BoutonEnvoi>
              </div>
            </Formulaire>
          </section>
        ) : null}
      </div>
    </>
  );
}
