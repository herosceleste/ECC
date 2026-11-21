import type { Metadata } from 'next';
import Link from 'next/link';
import { BoutonEnvoi, Formulaire } from '@/composants/formulaire';
import { appelerApi } from '@/lib/api';
import { chargerMoi } from '@/lib/contexte';
import { peut } from '@/lib/droits';
import type { MonParcours } from '@/lib/types';
import { marquerEtape } from './actions';
import { Corps, PointsEtape, SousNavigationIntegration } from './composants';

export const metadata: Metadata = { title: 'Mon intégration' };

export default async function MonIntegration() {
  const [parcours, moi] = await Promise.all([appelerApi<MonParcours>('/integration/mon-parcours'), chargerMoi()]);
  const editeur = peut(moi.adhesions, 'accueil:editer');
  const aSigner = parcours.engagements.filter((e) => !e.signe);
  const total = parcours.etapes.length;

  return (
    <>
      <div className="titre-page">
        <h1>Bienvenue dans l’équipe</h1>
        <Link href="/accueil?ignorer=1">Aller au tableau de bord</Link>
      </div>
      <SousNavigationIntegration actif="parcours" editeur={editeur} />

      {!parcours.actif ? (
        <div className="carte etat-vide">
          <p>Le parcours d’accueil n’est pas encore ouvert pour votre groupe.</p>
        </div>
      ) : (
        <div className="deux-colonnes">
          <div>
            {aSigner.length > 0 ? (
              <div className="alerte alerte-attention" role="status">
                <p>
                  À faire en premier : lire et signer {aSigner.length > 1 ? 'les textes suivants' : 'le texte suivant'} :{' '}
                  {aSigner.map((e) => `« ${e.titre} »`).join(' et ')}. <Link href="/integration/engagements">Lire les textes</Link>
                </p>
              </div>
            ) : null}

            <section aria-labelledby="titre-etapes">
              <h2 id="titre-etapes">Mon parcours</h2>
              {total === 0 ? (
                <p className="aide">Aucune étape n’a encore été préparée.</p>
              ) : (
                <>
                  <label htmlFor="progression" className="aide">
                    {parcours.complet
                      ? 'Parcours terminé : merci et bienvenue !'
                      : `${parcours.nombreTerminees} étape${parcours.nombreTerminees > 1 ? 's' : ''} sur ${total}`}
                  </label>
                  <progress id="progression" max={total} value={parcours.nombreTerminees} style={{ width: '100%', height: '0.9rem' }}>
                    {parcours.nombreTerminees} sur {total}
                  </progress>
                  <ol style={{ listStyle: 'none', padding: 0, marginTop: '1rem' }}>
                    {parcours.etapes.map((e, i) => (
                      <li key={e.id} className="carte" aria-labelledby={`etape-${e.id}`}>
                        <div className="titre-page" style={{ marginBottom: '0.5rem' }}>
                          <h3 id={`etape-${e.id}`} style={{ margin: 0 }}>
                            {i + 1}. {e.titre}
                          </h3>
                          <span className="aide">{e.national ? 'Pour toute l’association' : e.portee}</span>
                        </div>
                        <Corps texte={e.corps} />
                        {e.lienVideo ? (
                          <p>
                            <a href={e.lienVideo} target="_blank" rel="noopener noreferrer">
                              Voir la vidéo <span className="visuellement-masque">(nouvelle fenêtre)</span>
                            </a>
                          </p>
                        ) : null}
                        <Formulaire action={marquerEtape} libelle={`Étape ${i + 1}`}>
                          <input type="hidden" name="id" value={e.id} />
                          <input type="hidden" name="terminee" value={e.terminee ? 'non' : 'oui'} />
                          {e.terminee ? <span className="badge badge-succes">Terminée</span> : null}
                          <BoutonEnvoi variante={e.terminee ? 'secondaire' : undefined}>
                            {e.terminee ? 'Remettre à faire' : 'J’ai terminé cette étape'}
                          </BoutonEnvoi>
                        </Formulaire>
                      </li>
                    ))}
                  </ol>
                </>
              )}
            </section>
          </div>

          <div>
            <section className="carte" aria-labelledby="titre-parrain">
              <h2 id="titre-parrain">Mon parrain ou ma marraine</h2>
              {parcours.parrain ? (
                <>
                  <p>
                    <strong>{parcours.parrain.nomAffiche}</strong> vous accompagne pendant vos premiers mois.{' '}
                    <a href={`mailto:${parcours.parrain.email}`}>{parcours.parrain.email}</a>
                  </p>
                  <h3>Points d’étape</h3>
                  <PointsEtape parrainageId="" points={parcours.parrain.points} gerer={false} />
                </>
              ) : (
                <p className="aide">Votre coordinateur va bientôt vous présenter la personne qui vous accompagnera.</p>
              )}
            </section>

            {parcours.filleuls.length > 0 ? (
              <section className="carte" aria-labelledby="titre-filleuls">
                <h2 id="titre-filleuls">Les personnes que j’accompagne</h2>
                {parcours.filleuls.map((f) => (
                  <div key={f.parrainageId} style={{ marginBottom: '1rem' }}>
                    <h3>{f.nomAffiche}</h3>
                    <p className="aide">
                      Parcours : {f.etapesTerminees} étape(s) sur {f.etapesTotal}
                      {f.email ? (
                        <>
                          {' · '}
                          <a href={`mailto:${f.email}`}>{f.email}</a>
                        </>
                      ) : null}
                    </p>
                    <PointsEtape parrainageId={f.parrainageId} points={f.points} gerer />
                  </div>
                ))}
              </section>
            ) : null}

            <section className="carte" aria-labelledby="titre-utile">
              <h2 id="titre-utile">Besoin d’aide ?</h2>
              <p>
                <Link href="/integration/ressources">Fiches pratiques, questions fréquentes et contacts utiles</Link>
              </p>
            </section>
          </div>
        </div>
      )}
    </>
  );
}
