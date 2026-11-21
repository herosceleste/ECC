import type { Metadata } from 'next';
import Link from 'next/link';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { TYPES_ACTIVITE } from '@/lib/benevoles';
import { chargerMoi, chargerOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { options } from '@/lib/travaux';
import { creerActivite } from '../../actions';

export const metadata: Metadata = { title: 'Proposer une activité' };

export default async function NouvelleActivite({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ intervention, organisation }, moi, organisations] = await Promise.all([
    searchParams,
    chargerMoi(),
    chargerOrganisations(),
  ]);
  const possibles = organisations
    .filter((o) => peut(moi.adhesions, 'benevoles:gerer', o.chemin))
    .map((o) => ({ valeur: o.id, libelle: o.nom }));
  const chantier = Boolean(intervention);

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/benevoles">Bénévoles</Link> › Proposer une activité
      </nav>
      <h1>{chantier ? 'Organiser un chantier collectif' : 'Proposer une activité'}</h1>
      <section className="carte" style={{ maxWidth: '42rem' }} aria-label="Nouvelle activité">
        {possibles.length === 0 ? (
          <p>Votre rôle ne permet pas de proposer une activité.</p>
        ) : (
          <Formulaire action={creerActivite}>
            {intervention ? <input type="hidden" name="interventionId" value={intervention} /> : null}
            <Champ nom="organisationId" libelle="Groupe" obligatoire options={possibles} valeur={organisation} />
            <Champ
              nom="type"
              libelle="Type d’activité"
              obligatoire
              options={options(TYPES_ACTIVITE)}
              valeur={chantier ? 'CHANTIER' : 'VISITE'}
            />
            <Champ nom="titre" libelle="Titre" obligatoire aide="Ex. : Chantier peinture chez la famille Exemple" />
            <Champ nom="description" libelle="Description" type="textarea" aide="Ce qu’il faut prévoir, à qui s’adresser sur place." />
            <Champ nom="lieu" libelle="Lieu" />
            <div className="ligne-champs">
              <Champ nom="date" libelle="Date" type="date" obligatoire />
              <Champ nom="heureDebut" libelle="Début" type="time" obligatoire />
              <Champ nom="heureFin" libelle="Fin" type="time" obligatoire />
            </div>
            <Champ nom="places" libelle="Nombre de places" type="number" min={1} max={500} aide="Laissez vide s’il n’y a pas de limite." />
            <div className="actions">
              <BoutonEnvoi>Publier dans le planning</BoutonEnvoi>
              <Link href="/benevoles">Annuler</Link>
            </div>
          </Formulaire>
        )}
      </section>
    </>
  );
}
