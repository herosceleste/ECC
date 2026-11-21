import type { Metadata } from 'next';
import Link from 'next/link';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { TYPES_CONTENU } from '@/lib/accueil';
import { appelerApi } from '@/lib/api';
import { chargerMoi, chargerOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { options } from '@/lib/travaux';
import type { ContenuAccueil } from '@/lib/types';
import { creerContenu, modifierContenu, supprimerContenu } from '../actions';
import { SousNavigationIntegration } from '../composants';

export const metadata: Metadata = { title: 'Contenus d’accueil' };

export default async function GestionContenus({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [{ modifier, modifie }, contenus, moi, organisations] = await Promise.all([
    searchParams,
    appelerApi<ContenuAccueil[]>('/integration/contenus'),
    chargerMoi(),
    chargerOrganisations(),
  ]);
  const editables = organisations.filter((o) => peut(moi.adhesions, 'accueil:editer', o.chemin));
  if (editables.length === 0) {
    return (
      <div className="carte">
        <h1>Contenus d’accueil</h1>
        <p>Votre rôle ne permet pas de modifier les contenus d’accueil.</p>
      </div>
    );
  }
  const racineEditable = editables.some((o) => o.type === 'ASSOCIATION');
  const types = Object.fromEntries(
    Object.entries(TYPES_CONTENU).filter(([cle]) => racineEditable || !cle.startsWith('ENGAGEMENT')),
  );
  const enCours = contenus.find((c) => c.id === modifier && c.modifiable);

  return (
    <>
      <div className="titre-page">
        <h1>Bienvenue dans l’équipe</h1>
      </div>
      <SousNavigationIntegration actif="gestion" editeur />
      {modifie ? (
        <div className="alerte alerte-succes" role="status">
          <p>Contenu mis à jour.</p>
        </div>
      ) : null}

      <div className="deux-colonnes">
        <section aria-labelledby="titre-liste">
          <h2 id="titre-liste">Contenus</h2>
          <p className="aide">
            Les contenus de l’association valent pour tous les groupes ; une antenne ou un groupe ajoute les siens sans
            pouvoir modifier ceux du dessus.
          </p>
          {Object.entries(TYPES_CONTENU).map(([type, libelle]) => {
            const liste = contenus.filter((c) => c.type === type);
            if (liste.length === 0) return null;
            return (
              <div key={type} className="carte">
                <h3>{libelle}</h3>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  {liste.map((c) => (
                    <li key={c.id} style={{ padding: '0.4rem 0', borderBottom: '1px solid var(--bordure)' }}>
                      <strong>{c.titre}</strong>{' '}
                      <span className="aide">
                        · {c.national ? 'Association' : c.portee}
                        {c.publie ? '' : ' · brouillon'}
                      </span>
                      {c.modifiable ? (
                        <div className="actions">
                          <Link href={`/integration/gestion?modifier=${c.id}`}>Modifier</Link>
                          <Formulaire action={supprimerContenu} libelle={`Supprimer ${c.titre}`}>
                            <input type="hidden" name="id" value={c.id} />
                            <BoutonEnvoi variante="danger">Supprimer</BoutonEnvoi>
                          </Formulaire>
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </section>

        <section className="carte" aria-labelledby="titre-edition">
          <h2 id="titre-edition">{enCours ? `Modifier « ${enCours.titre} »` : 'Ajouter un contenu'}</h2>
          {enCours?.type.startsWith('ENGAGEMENT') ? (
            <div className="alerte alerte-attention" role="note">
              <p>Toute modification de ce texte demandera à chacun de le signer à nouveau.</p>
            </div>
          ) : null}
          <Formulaire action={enCours ? modifierContenu : creerContenu} viderApresSucces={!enCours}>
            {enCours ? (
              <input type="hidden" name="id" value={enCours.id} />
            ) : (
              <>
                <Champ
                  nom="organisationId"
                  libelle="Pour"
                  obligatoire
                  options={editables.map((o) => ({ valeur: o.id, libelle: o.type === 'ASSOCIATION' ? `${o.nom} (toute l’association)` : o.nom }))}
                />
                <Champ nom="type" libelle="Type" obligatoire options={options(types)} />
              </>
            )}
            <Champ nom="titre" libelle="Titre" obligatoire valeur={enCours?.titre} aide="Pour une question fréquente : la question." />
            <Champ
              nom="corps"
              libelle="Texte"
              type="textarea"
              obligatoire
              valeur={enCours?.corps}
              aide="Une ligne vide sépare deux paragraphes. Pour un contact : nom, rôle, téléphone, courriel."
            />
            <Champ nom="lienVideo" libelle="Lien vers une vidéo" type="url" valeur={enCours?.lienVideo} aide="Adresse en https://" />
            <Champ nom="ordre" libelle="Ordre d’affichage" type="number" min={0} max={1000} valeur={enCours?.ordre ?? 0} />
            <label className="case">
              <input type="checkbox" name="publie" value="oui" defaultChecked={enCours ? enCours.publie : true} />
              Publié (décocher pour garder en brouillon)
            </label>
            <div className="actions">
              <BoutonEnvoi>{enCours ? 'Enregistrer les modifications' : 'Ajouter'}</BoutonEnvoi>
              {enCours ? <Link href="/integration/gestion">Annuler</Link> : null}
            </div>
          </Formulaire>
        </section>
      </div>
    </>
  );
}
