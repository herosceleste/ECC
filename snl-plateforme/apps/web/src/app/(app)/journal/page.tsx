import type { Metadata } from 'next';
import Link from 'next/link';
import { appelerApi, ErreurApi } from '@/lib/api';
import { dateHeure } from '@/lib/format';
import type { EvenementAudit, Membre } from '@/lib/types';

export const metadata: Metadata = { title: 'Journal d’audit' };

const RESULTATS: Record<string, { libelle: string; classe: string }> = {
  SUCCES: { libelle: 'Réussi', classe: 'badge-succes' },
  REFUS: { libelle: 'Refusé', classe: 'badge-alerte' },
  ERREUR: { libelle: 'Erreur', classe: 'badge-erreur' },
};

const ENTITES = ['personne', 'menage', 'logement', 'immeuble', 'document', 'organisation', 'utilisateur', 'referentiel'];

export default async function Journal({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const parametres = await searchParams;
  const page = Math.max(1, Number(parametres.page) || 1);
  const entite = ENTITES.includes(parametres.entite ?? '') ? parametres.entite : undefined;
  const requete = new URLSearchParams({ page: String(page), ...(entite ? { entiteType: entite } : {}) });

  let resultat: { evenements: EvenementAudit[]; taillePage: number };
  try {
    resultat = await appelerApi(`/audit?${requete}`);
  } catch (erreur) {
    if (erreur instanceof ErreurApi && erreur.statut === 403) {
      return (
        <div className="carte">
          <h1>Journal d’audit</h1>
          <p>{erreur.message}</p>
        </div>
      );
    }
    throw erreur;
  }
  const membres = await appelerApi<Membre[]>('/utilisateurs');
  const noms = new Map(membres.map((m) => [m.utilisateur.id, m.utilisateur.nomAffiche]));
  const lien = (p: number) => `/journal?${new URLSearchParams({ page: String(p), ...(entite ? { entite } : {}) })}`;

  return (
    <>
      <div className="titre-page">
        <h1>Journal d’audit</h1>
      </div>
      <p className="chapo">
        Chaque consultation ou modification de données personnelles, réussie ou refusée. Ce journal ne peut être ni
        modifié ni effacé.
      </p>
      <form method="get" className="actions" aria-label="Filtrer le journal">
        <label htmlFor="filtre-entite">Élément</label>
        <select id="filtre-entite" name="entite" defaultValue={entite ?? ''} style={{ width: 'auto' }}>
          <option value="">Tous</option>
          {ENTITES.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <button type="submit" className="bouton bouton-secondaire">
          Filtrer
        </button>
      </form>

      <div className="tableau-conteneur" style={{ marginTop: '1rem' }}>
        <table>
          <caption className="visuellement-masque">Événements, du plus récent au plus ancien</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Personne</th>
              <th scope="col">Action</th>
              <th scope="col">Élément</th>
              <th scope="col">Résultat</th>
            </tr>
          </thead>
          <tbody>
            {resultat.evenements.length === 0 ? (
              <tr>
                <td colSpan={5} className="etat-vide">
                  Aucun événement.
                </td>
              </tr>
            ) : (
              resultat.evenements.map((e) => (
                <tr key={e.id}>
                  <td>{dateHeure(e.horodatage)}</td>
                  <td>{e.utilisateurId ? (noms.get(e.utilisateurId) ?? 'Compte hors périmètre') : 'Système'}</td>
                  <td>{e.action}</td>
                  <td>
                    {e.entiteType}
                    {e.entiteId ? <span className="aide"> · {e.entiteId.slice(0, 8)}</span> : null}
                  </td>
                  <td>
                    <span className={`badge ${RESULTATS[e.resultat]?.classe ?? ''}`}>
                      {RESULTATS[e.resultat]?.libelle}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <nav className="pagination" aria-label="Pagination">
        {page > 1 ? <Link href={lien(page - 1)}>← Plus récents</Link> : <span />}
        {resultat.evenements.length === resultat.taillePage ? <Link href={lien(page + 1)}>Plus anciens →</Link> : null}
      </nav>
    </>
  );
}
