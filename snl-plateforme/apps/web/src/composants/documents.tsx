import { deposerDocument, supprimerDocument } from '@/app/(app)/documents/actions';
import { appelerApi } from '@/lib/api';
import { dateCourte, taille } from '@/lib/format';
import type { DocumentInfo } from '@/lib/types';
import { BoutonEnvoi, Champ, Formulaire } from './formulaire';

const CATEGORIES = [
  { valeur: 'bail', libelle: 'Bail et annexes' },
  { valeur: 'diagnostic', libelle: 'Diagnostic (DPE, électricité…)' },
  { valeur: 'assurance', libelle: 'Assurance' },
  { valeur: 'justificatif', libelle: 'Justificatif' },
  { valeur: 'photo', libelle: 'Photo' },
  { valeur: 'courrier', libelle: 'Courrier' },
  { valeur: 'autre', libelle: 'Autre' },
];

interface Props {
  entiteType: 'logement' | 'menage' | 'personne' | 'immeuble' | 'organisation' | 'intervention';
  entiteId: string;
  page: string;
  peutDeposer: boolean;
  /** Catégorie proposée d'abord (par exemple « photo » pour un signalement). */
  categorieParDefaut?: string;
}

/** Documents rattachés à une entité : liste, téléchargement, dépôt. */
export async function SectionDocuments({ entiteType, entiteId, page, peutDeposer, categorieParDefaut }: Props) {
  const documents = await appelerApi<DocumentInfo[]>(
    `/documents?entiteType=${entiteType}&entiteId=${encodeURIComponent(entiteId)}`,
  );

  return (
    <section className="carte" aria-labelledby={`titre-documents-${entiteId}`}>
      <h2 id={`titre-documents-${entiteId}`}>Documents</h2>
      {documents.length === 0 ? (
        <p className="aide">Aucun document pour le moment.</p>
      ) : (
        <ul>
          {documents.map((d) => (
            <li key={d.id}>
              <a href={`/documents/${d.id}/telecharger`}>{d.nomFichier}</a>
              <span className="aide">
                {' '}
                · {CATEGORIES.find((c) => c.valeur === d.categorie)?.libelle ?? d.categorie} · version {d.version} ·{' '}
                {taille(d.tailleOctets)} · {dateCourte(d.creeLe)}
              </span>
              {peutDeposer ? (
                <Formulaire action={supprimerDocument} libelle={`Supprimer ${d.nomFichier}`}>
                  <input type="hidden" name="id" value={d.id} />
                  <input type="hidden" name="page" value={page} />
                  <BoutonEnvoi variante="danger">Supprimer</BoutonEnvoi>
                </Formulaire>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {peutDeposer ? (
        <>
          <h3>Déposer un document</h3>
          <Formulaire action={deposerDocument} viderApresSucces libelle="Déposer un document">
            <input type="hidden" name="entiteType" value={entiteType} />
            <input type="hidden" name="entiteId" value={entiteId} />
            <input type="hidden" name="page" value={page} />
            <Champ nom="categorie" libelle="Catégorie" obligatoire options={CATEGORIES} valeur={categorieParDefaut} />
            <Champ
              nom="fichier"
              libelle="Fichier"
              type="file"
              obligatoire
              aide="PDF, image (JPEG, PNG, WebP), ou document bureautique. 15 Mo au plus. Chaque fichier est analysé avant d’être enregistré."
            />
            <div className="actions">
              <BoutonEnvoi>Déposer</BoutonEnvoi>
            </div>
          </Formulaire>
        </>
      ) : null}
    </section>
  );
}
