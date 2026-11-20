import type { Metadata } from 'next';
import { ROLES } from '@snl/shared';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi } from '@/lib/api';
import { chargerMoi, chargerOrganisations, cheminsOrganisations } from '@/lib/contexte';
import { LIBELLES_ROLES, peut } from '@/lib/droits';
import type { Membre } from '@/lib/types';
import { changerStatut, inviter, retirerRole } from './actions';

export const metadata: Metadata = { title: 'Équipe' };

const STATUTS: Record<string, { libelle: string; classe: string }> = {
  ACTIF: { libelle: 'Actif', classe: 'badge-succes' },
  INVITE: { libelle: 'Invité', classe: 'badge-alerte' },
  SUSPENDU: { libelle: 'Suspendu', classe: 'badge-erreur' },
};

export default async function Utilisateurs() {
  const [membres, moi, organisations, chemins] = await Promise.all([
    appelerApi<Membre[]>('/utilisateurs'),
    chargerMoi(),
    chargerOrganisations(),
    cheminsOrganisations(),
  ]);
  const a = moi.adhesions;
  const gerables = organisations
    .filter((o) => peut(a, 'utilisateur:gerer', o.chemin))
    .map((o) => ({ valeur: o.id, libelle: o.nom }));
  const peutGerer = (organisationId: string) => peut(a, 'utilisateur:gerer', chemins.get(organisationId));

  return (
    <>
      <div className="titre-page">
        <h1>Équipe</h1>
      </div>
      <div className={gerables.length > 0 ? 'deux-colonnes' : undefined}>
        <section aria-labelledby="titre-membres">
          <h2 id="titre-membres" className="visuellement-masque">
            Membres
          </h2>
          <div className="tableau-conteneur">
            <table>
              <caption className="visuellement-masque">Membres et rôles</caption>
              <thead>
                <tr>
                  <th scope="col">Personne</th>
                  <th scope="col">Rôle</th>
                  <th scope="col">Statut</th>
                  <th scope="col">
                    <span className="visuellement-masque">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {membres.map((m) => {
                  const statut = STATUTS[m.utilisateur.statut];
                  const gerer = peutGerer(m.organisation.id) && m.utilisateur.id !== moi.id;
                  return (
                    <tr key={m.adhesionId}>
                      <th scope="row">
                        {m.utilisateur.nomAffiche}
                        <br />
                        <span className="aide">{m.utilisateur.email}</span>
                      </th>
                      <td>
                        {LIBELLES_ROLES[m.role] ?? m.role}
                        <br />
                        <span className="aide">{m.organisation.nom}</span>
                      </td>
                      <td>
                        <span className={`badge ${statut?.classe ?? ''}`}>{statut?.libelle}</span>
                      </td>
                      <td>
                        {gerer ? (
                          <div className="actions">
                            <Formulaire action={retirerRole} libelle={`Retirer le rôle de ${m.utilisateur.nomAffiche}`}>
                              <input type="hidden" name="adhesionId" value={m.adhesionId} />
                              <BoutonEnvoi variante="secondaire">Retirer ce rôle</BoutonEnvoi>
                            </Formulaire>
                            {m.utilisateur.statut !== 'INVITE' ? (
                              <Formulaire action={changerStatut} libelle={`Statut de ${m.utilisateur.nomAffiche}`}>
                                <input type="hidden" name="utilisateurId" value={m.utilisateur.id} />
                                <input
                                  type="hidden"
                                  name="operation"
                                  value={m.utilisateur.statut === 'SUSPENDU' ? 'reactivation' : 'suspension'}
                                />
                                <BoutonEnvoi variante={m.utilisateur.statut === 'SUSPENDU' ? 'secondaire' : 'danger'}>
                                  {m.utilisateur.statut === 'SUSPENDU' ? 'Réactiver' : 'Suspendre'}
                                </BoutonEnvoi>
                              </Formulaire>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {gerables.length > 0 ? (
          <section className="carte" aria-labelledby="titre-inviter">
            <h2 id="titre-inviter">Inviter une personne</h2>
            <p className="aide">
              Elle recevra un courriel pour choisir son mot de passe. Les rôles sensibles devront configurer une
              application d’authentification.
            </p>
            <Formulaire action={inviter} viderApresSucces>
              <Champ nom="nomAffiche" libelle="Prénom et nom" obligatoire autoComplete="off" />
              <Champ nom="email" libelle="Adresse électronique" type="email" obligatoire autoComplete="off" />
              <Champ nom="organisationId" libelle="Organisation" obligatoire options={gerables} />
              <Champ
                nom="role"
                libelle="Rôle"
                obligatoire
                valeur="BENEVOLE"
                options={ROLES.map((r) => ({ valeur: r, libelle: LIBELLES_ROLES[r] ?? r }))}
              />
              <div className="actions">
                <BoutonEnvoi>Envoyer l’invitation</BoutonEnvoi>
              </div>
            </Formulaire>
          </section>
        ) : null}
      </div>
    </>
  );
}
