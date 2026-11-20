import type { Metadata } from 'next';
import Link from 'next/link';
import { appelerApi } from '@/lib/api';
import { chargerMoi } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import { dateCourte } from '@/lib/format';
import { CATEGORIES, PRIORITES, STATUTS } from '@/lib/travaux';
import type { InterventionResume } from '@/lib/types';
import { SousNavigation } from './sous-navigation';

export const metadata: Metadata = { title: 'Travaux' };

const ORDRE_PRIORITE: Record<string, number> = { URGENTE: 0, HAUTE: 1, NORMALE: 2, BASSE: 3 };

export default async function Travaux({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const parametres = await searchParams;
  const statut = parametres.statut && parametres.statut in STATUTS ? parametres.statut : undefined;
  const miennes = parametres.miennes === 'oui';
  const requete = new URLSearchParams({ ...(statut ? { statut } : {}), ...(miennes ? { mesAffectations: 'oui' } : {}) });
  const [interventions, moi] = await Promise.all([
    appelerApi<InterventionResume[]>(`/travaux/interventions?${requete}`),
    chargerMoi(),
  ]);

  // Sans filtre de statut, on masque ce qui est terminé et on remonte l'urgent.
  const affichees = (statut ? interventions : interventions.filter((i) => !['CLOS', 'ANNULE'].includes(i.statut))).sort(
    (x, y) => (ORDRE_PRIORITE[x.priorite ?? 'NORMALE'] ?? 2) - (ORDRE_PRIORITE[y.priorite ?? 'NORMALE'] ?? 2),
  );

  return (
    <>
      <div className="titre-page">
        <h1>Travaux et entretien</h1>
        {peut(moi.adhesions, 'travaux:signaler') ? (
          <Link className="bouton" href="/travaux/signaler">
            Signaler un problème
          </Link>
        ) : null}
      </div>
      <SousNavigation actif="signalements" />

      <form method="get" className="actions" aria-label="Filtrer les signalements">
        <label htmlFor="filtre-statut">Statut</label>
        <select id="filtre-statut" name="statut" defaultValue={statut ?? ''} style={{ width: 'auto' }}>
          <option value="">En cours de traitement</option>
          {Object.entries(STATUTS).map(([valeur, { libelle }]) => (
            <option key={valeur} value={valeur}>
              {libelle}
            </option>
          ))}
        </select>
        <label className="case">
          <input type="checkbox" name="miennes" value="oui" defaultChecked={miennes} />
          Seulement ceux qui me sont confiés
        </label>
        <button type="submit" className="bouton bouton-secondaire">
          Filtrer
        </button>
      </form>
      <p className="aide" aria-live="polite">
        {affichees.length} signalement{affichees.length > 1 ? 's' : ''}
      </p>

      {affichees.length === 0 ? (
        <div className="carte etat-vide">
          <p>Aucun signalement à afficher.</p>
        </div>
      ) : (
        <div className="tableau-conteneur">
          <table>
            <caption className="visuellement-masque">Signalements, les plus urgents en premier</caption>
            <thead>
              <tr>
                <th scope="col">Problème</th>
                <th scope="col">Logement</th>
                <th scope="col">Priorité</th>
                <th scope="col">Statut</th>
                <th scope="col">Confié à</th>
                <th scope="col">Signalé le</th>
              </tr>
            </thead>
            <tbody>
              {affichees.map((i) => (
                <tr key={i.id}>
                  <th scope="row">
                    <Link href={`/travaux/${i.id}`}>{CATEGORIES[i.categorie] ?? i.categorie}</Link>
                  </th>
                  <td>{i.logement?.reference ?? '—'}</td>
                  <td>
                    {i.priorite ? (
                      <span className={`badge ${i.priorite === 'URGENTE' ? 'badge-erreur' : ''}`}>{PRIORITES[i.priorite]}</span>
                    ) : (
                      <span className="aide">À qualifier</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${STATUTS[i.statut]?.classe ?? ''}`}>{STATUTS[i.statut]?.libelle}</span>
                  </td>
                  <td>{i.affecteUtilisateur?.nomAffiche ?? i.affecteArtisan?.raisonSociale ?? '—'}</td>
                  <td>{dateCourte(i.creeLe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
