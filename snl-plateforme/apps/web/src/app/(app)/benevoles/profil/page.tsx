import type { Metadata } from 'next';
import Link from 'next/link';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi } from '@/lib/api';
import { JOURS, libelleDisponibilite } from '@/lib/benevoles';
import type { MonProfil } from '@/lib/types';
import { ajouterDisponibilite, modifierProfil, supprimerDisponibilite } from '../actions';
import { SousNavigationBenevoles } from '../composants';

export const metadata: Metadata = { title: 'Mon profil de bénévole' };

const OPTIONS_JOURS = JOURS.slice(1).map((jour, i) => ({ valeur: String(i + 1), libelle: jour.charAt(0).toUpperCase() + jour.slice(1) }));

export default async function MonProfilBenevole() {
  const [{ profil, disponibilites }, mesMenages] = await Promise.all([
    appelerApi<MonProfil>('/benevoles/moi/profil'),
    appelerApi<{ id: string; libelle: string }[]>('/benevoles/moi/menages'),
  ]);

  return (
    <>
      <div className="titre-page">
        <h1>Bénévoles</h1>
      </div>
      <SousNavigationBenevoles actif="profil" />
      <div className="deux-colonnes">
        <div>
          <section className="carte" aria-labelledby="titre-profil">
            <h2 id="titre-profil">Mon profil</h2>
            <Formulaire action={modifierProfil}>
              <Champ nom="telephone" libelle="Téléphone" type="tel" valeur={profil.telephone} />
              <label className="case">
                <input type="checkbox" name="telephoneMasque" value="oui" defaultChecked={profil.telephoneMasque} />
                Ne montrer mon téléphone qu’aux coordinateurs
              </label>
              <Champ
                nom="competences"
                libelle="Compétences"
                valeur={profil.competences.join(', ')}
                aide="Séparées par des virgules. Ex. : bricolage, peinture, démarches administratives"
              />
              <Champ nom="centresInteret" libelle="Centres d’intérêt" valeur={profil.centresInteret.join(', ')} />
              <Champ nom="dateArrivee" libelle="Arrivée dans le groupe" type="date" valeur={profil.dateArrivee?.slice(0, 10)} />
              <div className="actions">
                <BoutonEnvoi>Enregistrer</BoutonEnvoi>
              </div>
            </Formulaire>
          </section>

          <section className="carte" aria-labelledby="titre-menages">
            <h2 id="titre-menages">Les ménages que j’accompagne</h2>
            {mesMenages.length === 0 ? (
              <p className="aide">Vous n’êtes référent d’aucun ménage pour le moment.</p>
            ) : (
              <ul>
                {mesMenages.map((m) => (
                  <li key={m.id}>
                    <Link href={`/menages/${m.id}`}>{m.libelle}</Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="carte" aria-labelledby="titre-dispos">
          <h2 id="titre-dispos">Mes disponibilités</h2>
          <p className="aide">Elles aident la coordination à vous proposer des activités. Seuls les coordinateurs les voient.</p>
          {disponibilites.length === 0 ? (
            <p className="aide">Aucune disponibilité indiquée.</p>
          ) : (
            <ul>
              {disponibilites.map((d) => (
                <li key={d.id}>
                  {libelleDisponibilite(d)}
                  <Formulaire action={supprimerDisponibilite} libelle={`Retirer : ${libelleDisponibilite(d)}`}>
                    <input type="hidden" name="id" value={d.id} />
                    <BoutonEnvoi variante="secondaire">Retirer</BoutonEnvoi>
                  </Formulaire>
                </li>
              ))}
            </ul>
          )}
          <h3>Ajouter une disponibilité</h3>
          <Formulaire action={ajouterDisponibilite} viderApresSucces libelle="Ajouter une disponibilité">
            <fieldset className="champ">
              <legend>Fréquence</legend>
              <label className="case">
                <input type="radio" name="genre" value="recurrente" defaultChecked />
                Chaque semaine
              </label>
              <label className="case">
                <input type="radio" name="genre" value="ponctuelle" />
                Une seule fois
              </label>
            </fieldset>
            <div className="ligne-champs">
              <Champ nom="jourSemaine" libelle="Jour (chaque semaine)" options={OPTIONS_JOURS} />
              <Champ nom="date" libelle="Date (une seule fois)" type="date" />
            </div>
            <div className="ligne-champs">
              <Champ nom="heureDebut" libelle="De" type="time" obligatoire />
              <Champ nom="heureFin" libelle="À" type="time" obligatoire />
            </div>
            <Champ nom="commentaire" libelle="Précision" />
            <div className="actions">
              <BoutonEnvoi variante="secondaire">Ajouter</BoutonEnvoi>
            </div>
          </Formulaire>
        </section>
      </div>
    </>
  );
}
