import type { Metadata } from 'next';
import Link from 'next/link';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi } from '@/lib/api';
import { chargerMoi, chargerOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import type { Immeuble } from '@/lib/types';
import { creerImmeuble, creerLogement } from '../actions';
import { ChampsLogement } from '../champs';

export const metadata: Metadata = { title: 'Ajouter un logement' };

export default async function NouveauLogement() {
  const [moi, organisations, immeubles] = await Promise.all([
    chargerMoi(),
    chargerOrganisations(),
    appelerApi<Immeuble[]>('/immeubles'),
  ]);
  const possibles = organisations
    .filter((o) => peut(moi.adhesions, 'logement:ecrire', o.chemin))
    .map((o) => ({ valeur: o.id, libelle: o.nom }));

  if (possibles.length === 0) {
    return (
      <div className="carte">
        <h1>Ajouter un logement</h1>
        <p>Votre rôle ne permet pas d’ajouter de logement.</p>
        <Link href="/logements">Retour aux logements</Link>
      </div>
    );
  }

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/logements">Logements</Link> › Ajouter
      </nav>
      <h1>Ajouter un logement</h1>
      <div className="deux-colonnes">
        <section className="carte" aria-label="Nouveau logement">
          <Formulaire action={creerLogement}>
            <Champ nom="organisationId" libelle="Groupe ou antenne" obligatoire options={possibles} />
            <ChampsLogement immeubles={immeubles} />
            <div className="actions">
              <BoutonEnvoi>Enregistrer le logement</BoutonEnvoi>
              <Link href="/logements">Annuler</Link>
            </div>
          </Formulaire>
        </section>

        <section className="carte" aria-labelledby="titre-immeuble">
          <h2 id="titre-immeuble">L’immeuble n’est pas dans la liste ?</h2>
          <Formulaire action={creerImmeuble} viderApresSucces>
            <Champ nom="organisationId" libelle="Groupe ou antenne" obligatoire options={possibles} />
            <Champ nom="ligneAdresse" libelle="Adresse" obligatoire autoComplete="street-address" />
            <div className="ligne-champs">
              <Champ nom="codePostal" libelle="Code postal" obligatoire autoComplete="postal-code" />
              <Champ nom="commune" libelle="Commune" obligatoire autoComplete="address-level2" />
            </div>
            <div className="actions">
              <BoutonEnvoi variante="secondaire">Ajouter l’immeuble</BoutonEnvoi>
            </div>
          </Formulaire>
        </section>
      </div>
    </>
  );
}
