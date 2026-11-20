import type { Metadata } from 'next';
import Link from 'next/link';
import { appelerApi } from '@/lib/api';
import { chargerMoi, nomsOrganisations } from '@/lib/contexte';
import { LIBELLES_STATUTS_LOGEMENT, peut } from '@/lib/droits';
import type { Logement } from '@/lib/types';

export const metadata: Metadata = { title: 'Logements' };

const CLASSES_STATUT: Record<string, string> = {
  DISPONIBLE: 'badge-succes',
  EN_TRAVAUX: 'badge-alerte',
  HORS_PARC: 'badge-erreur',
};

export default async function Logements({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { statut } = await searchParams;
  const filtre = statut && statut in LIBELLES_STATUTS_LOGEMENT ? statut : undefined;
  const [logements, noms, moi] = await Promise.all([
    appelerApi<Logement[]>(`/logements${filtre ? `?statut=${filtre}` : ''}`),
    nomsOrganisations(),
    chargerMoi(),
  ]);

  return (
    <>
      <div className="titre-page">
        <h1>Logements</h1>
        {peut(moi.adhesions, 'logement:ecrire') ? (
          <Link className="bouton" href="/logements/nouveau">
            Ajouter un logement
          </Link>
        ) : null}
      </div>

      <form method="get" className="actions" aria-label="Filtrer les logements">
        <label htmlFor="filtre-statut">Statut</label>
        <select id="filtre-statut" name="statut" defaultValue={filtre ?? ''} style={{ width: 'auto' }}>
          <option value="">Tous</option>
          {Object.entries(LIBELLES_STATUTS_LOGEMENT).map(([valeur, libelle]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
        <button type="submit" className="bouton bouton-secondaire">
          Filtrer
        </button>
      </form>
      <p aria-live="polite" className="aide">
        {logements.length} logement{logements.length > 1 ? 's' : ''}
      </p>

      {logements.length === 0 ? (
        <div className="carte etat-vide">
          <p>Aucun logement ne correspond.</p>
        </div>
      ) : (
        <div className="tableau-conteneur">
          <table>
            <caption className="visuellement-masque">Liste des logements</caption>
            <thead>
              <tr>
                <th scope="col">Référence</th>
                <th scope="col">Typologie</th>
                <th scope="col">Adresse</th>
                <th scope="col">Groupe</th>
                <th scope="col">Statut</th>
              </tr>
            </thead>
            <tbody>
              {logements.map((l) => (
                <tr key={l.id}>
                  <th scope="row">
                    <Link href={`/logements/${l.id}`}>{l.reference}</Link>
                  </th>
                  <td>
                    {l.typologie}
                    {l.surfaceM2 ? ` · ${Number(l.surfaceM2).toLocaleString('fr-FR')} m²` : ''}
                  </td>
                  <td>{l.immeuble ? `${l.immeuble.ligneAdresse}, ${l.immeuble.commune}` : '—'}</td>
                  <td>{noms.get(l.organisationId) ?? '—'}</td>
                  <td>
                    <span className={`badge ${CLASSES_STATUT[l.statut] ?? ''}`}>
                      {LIBELLES_STATUTS_LOGEMENT[l.statut]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
