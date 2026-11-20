import type { Metadata } from 'next';
import Link from 'next/link';
import { appelerApi } from '@/lib/api';
import { chargerMoi, nomsOrganisations } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import type { Menage } from '@/lib/types';

export const metadata: Metadata = { title: 'Ménages' };

export default async function Menages() {
  const [menages, noms, moi] = await Promise.all([
    appelerApi<Menage[]>('/menages'),
    nomsOrganisations(),
    chargerMoi(),
  ]);

  return (
    <>
      <div className="titre-page">
        <h1>Ménages</h1>
        {peut(moi.adhesions, 'menage:ecrire') ? (
          <Link className="bouton" href="/menages/nouveau">
            Ajouter un ménage
          </Link>
        ) : null}
      </div>
      {menages.length === 0 ? (
        <div className="carte etat-vide">
          <p>Aucun ménage enregistré dans votre périmètre.</p>
        </div>
      ) : (
        <div className="tableau-conteneur">
          <table>
            <caption className="visuellement-masque">Liste des ménages</caption>
            <thead>
              <tr>
                <th scope="col">Ménage</th>
                <th scope="col">Groupe</th>
              </tr>
            </thead>
            <tbody>
              {menages.map((m) => (
                <tr key={m.id}>
                  <th scope="row">
                    <Link href={`/menages/${m.id}`}>{m.libelle}</Link>
                  </th>
                  <td>{noms.get(m.organisationId) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
