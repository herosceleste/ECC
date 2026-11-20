import type { Metadata } from 'next';
import Link from 'next/link';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { chargerMoi, chargerOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { creerMenage } from '../actions';

export const metadata: Metadata = { title: 'Ajouter un ménage' };

export default async function NouveauMenage() {
  const [moi, organisations] = await Promise.all([chargerMoi(), chargerOrganisations()]);
  const possibles = organisations
    .filter((o) => peut(moi.adhesions, 'menage:ecrire', o.chemin))
    .map((o) => ({ valeur: o.id, libelle: o.nom }));

  return (
    <>
      <nav className="fil-ariane" aria-label="Fil d’Ariane">
        <Link href="/menages">Ménages</Link> › Ajouter
      </nav>
      <h1>Ajouter un ménage</h1>
      <section className="carte" style={{ maxWidth: '36rem' }} aria-label="Nouveau ménage">
        {possibles.length === 0 ? (
          <p>Votre rôle ne permet pas d’ajouter de ménage.</p>
        ) : (
          <Formulaire action={creerMenage}>
            <Champ nom="organisationId" libelle="Groupe ou antenne" obligatoire options={possibles} />
            <Champ
              nom="libelle"
              libelle="Nom du ménage"
              obligatoire
              aide="Un repère pour l’équipe, par exemple « Famille Diallo »."
            />
            <div className="actions">
              <BoutonEnvoi>Créer le ménage</BoutonEnvoi>
              <Link href="/menages">Annuler</Link>
            </div>
          </Formulaire>
        )}
      </section>
    </>
  );
}
