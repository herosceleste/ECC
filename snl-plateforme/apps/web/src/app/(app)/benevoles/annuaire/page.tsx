import type { Metadata } from 'next';
import { appelerApi } from '@/lib/api';
import { libelleDisponibilite } from '@/lib/benevoles';
import { LIBELLES_ROLES } from '@/lib/droits';
import { dateCourte } from '@/lib/format';
import type { MembreAnnuaire } from '@/lib/types';
import { SousNavigationBenevoles } from '../composants';

export const metadata: Metadata = { title: 'Annuaire des bénévoles' };

export default async function Annuaire() {
  const membres = await appelerApi<MembreAnnuaire[]>('/benevoles/annuaire');
  const voitDisponibilites = membres.some((m) => m.disponibilites !== undefined && m.disponibilites.length > 0);

  return (
    <>
      <div className="titre-page">
        <h1>Bénévoles</h1>
      </div>
      <SousNavigationBenevoles actif="annuaire" />
      <p className="aide">
        Les coordonnées sont réservées à l’organisation du groupe. Chacun peut masquer son téléphone dans son profil.
      </p>
      {membres.length === 0 ? (
        <div className="carte etat-vide">
          <p>Aucun membre à afficher.</p>
        </div>
      ) : (
        <div className="tableau-conteneur">
          <table>
            <caption className="visuellement-masque">Annuaire de l’équipe</caption>
            <thead>
              <tr>
                <th scope="col">Personne</th>
                <th scope="col">Rôle</th>
                <th scope="col">Contact</th>
                <th scope="col">Compétences</th>
                {voitDisponibilites ? <th scope="col">Disponibilités</th> : null}
              </tr>
            </thead>
            <tbody>
              {membres.map((m) => (
                <tr key={m.id}>
                  <th scope="row">
                    {m.nomAffiche}
                    {m.statut === 'INVITE' ? <span className="badge badge-alerte"> invité</span> : null}
                    {m.dateArrivee ? (
                      <>
                        <br />
                        <span className="aide">depuis le {dateCourte(m.dateArrivee)}</span>
                      </>
                    ) : null}
                  </th>
                  <td>
                    {m.roles.map((r) => (
                      <span key={`${r.role}-${r.organisation.id}`} style={{ display: 'block' }}>
                        {LIBELLES_ROLES[r.role] ?? r.role} <span className="aide">· {r.organisation.nom}</span>
                      </span>
                    ))}
                  </td>
                  <td>
                    <a href={`mailto:${m.email}`}>{m.email}</a>
                    {m.telephone ? (
                      <>
                        <br />
                        <a href={`tel:${m.telephone.replace(/\s/g, '')}`}>{m.telephone}</a>
                      </>
                    ) : null}
                  </td>
                  <td>{[...m.competences, ...m.centresInteret].join(', ') || '—'}</td>
                  {voitDisponibilites ? (
                    <td>
                      {m.disponibilites && m.disponibilites.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: '1rem' }}>
                          {m.disponibilites.map((d) => (
                            <li key={d.id}>{libelleDisponibilite(d)}</li>
                          ))}
                        </ul>
                      ) : (
                        '—'
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
