import type { Metadata } from 'next';
import Link from 'next/link';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi } from '@/lib/api';
import { chargerMoi, cheminsOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { CATEGORIES, NUMEROS_URGENCE, options } from '@/lib/travaux';
import type { Logement } from '@/lib/types';
import { signaler } from '../actions';

export const metadata: Metadata = { title: 'Signaler un problème' };

export default async function Signaler({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ logement: logementChoisi }, logements, moi, chemins] = await Promise.all([
    searchParams,
    appelerApi<Logement[]>('/logements'),
    chargerMoi(),
    cheminsOrganisations(),
  ]);
  const possibles = logements
    .filter((l) => peut(moi.adhesions, 'travaux:signaler', chemins.get(l.organisationId)))
    .map((l) => ({
      valeur: l.id,
      libelle: `${l.reference}${l.immeuble ? `, ${l.immeuble.ligneAdresse}, ${l.immeuble.commune}` : ''}`,
    }));

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/travaux">Travaux</Link> › Signaler un problème
      </nav>
      <h1>Signaler un problème</h1>

      <div className="deux-colonnes">
        <section className="carte" aria-label="Nouveau signalement">
          {possibles.length === 0 ? (
            <p>Aucun logement de votre périmètre ne permet de signaler un problème pour le moment.</p>
          ) : (
            <Formulaire action={signaler}>
              <Champ nom="logementId" libelle="Logement" obligatoire options={possibles} valeur={logementChoisi} />
              <Champ nom="categorie" libelle="Type de problème" obligatoire options={options(CATEGORIES)} />
              <Champ
                nom="description"
                libelle="Description"
                type="textarea"
                obligatoire
                aide="Ce qui se passe, depuis quand, où dans le logement. N’indiquez pas d’information personnelle sur les occupants."
              />
              <label className="case">
                <input type="checkbox" name="urgence" value="oui" />
                C’est urgent : fuite importante, absence de chauffage en hiver, risque pour la sécurité
              </label>
              <Champ
                nom="photos"
                libelle="Photos"
                type="file"
                multiple
                accepte="image/jpeg,image/png,image/webp"
                aide="Cinq photos au plus (JPEG, PNG ou WebP). Évitez de photographier des personnes."
              />
              <div className="actions">
                <BoutonEnvoi>Envoyer le signalement</BoutonEnvoi>
                <Link href="/travaux">Annuler</Link>
              </div>
            </Formulaire>
          )}
        </section>

        <aside className="carte" aria-labelledby="titre-danger">
          <h2 id="titre-danger">En cas de danger immédiat</h2>
          <p>N’attendez pas : appelez d’abord les secours, puis faites le signalement.</p>
          <ul>
            {NUMEROS_URGENCE.map((n) => (
              <li key={n.numero}>
                {n.libelle} : <a href={`tel:${n.tel}`}>{n.numero}</a>
              </li>
            ))}
          </ul>
          <p className="aide">Une odeur de gaz est toujours traitée comme une urgence.</p>
        </aside>
      </div>
    </>
  );
}
