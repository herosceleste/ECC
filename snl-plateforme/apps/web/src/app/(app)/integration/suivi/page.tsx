import type { Metadata } from 'next';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { appelerApi } from '@/lib/api';
import { dateCourte } from '@/lib/format';
import type { LigneSuivi, Membre } from '@/lib/types';
import { designerParrain } from '../actions';
import { PointsEtape, SousNavigationIntegration } from '../composants';

export const metadata: Metadata = { title: 'Nouveaux bénévoles' };

export default async function Suivi({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { designe } = await searchParams;
  const [lignes, membres] = await Promise.all([
    appelerApi<LigneSuivi[]>('/integration/suivi'),
    appelerApi<Membre[]>('/utilisateurs'),
  ]);
  // Parrains possibles : membres actifs de l'équipe, une seule fois chacun.
  const parrains = [
    ...new Map(
      membres
        .filter((m) => m.utilisateur.statut === 'ACTIF' && m.role !== 'ADMINISTRATEUR')
        .map((m) => [m.utilisateur.id, { valeur: m.utilisateur.id, libelle: m.utilisateur.nomAffiche }]),
    ).values(),
  ];

  return (
    <>
      <div className="titre-page">
        <h1>Bienvenue dans l’équipe</h1>
      </div>
      <SousNavigationIntegration actif="suivi" editeur />
      {designe ? (
        <div className="alerte alerte-succes" role="status">
          <p>Parrain ou marraine désigné, et prévenu par courriel.</p>
        </div>
      ) : null}
      <p className="aide">
        Un parcours inachevé 30 jours après l’arrivée du parrain déclenche un courriel de relance à celui-ci.
      </p>
      {lignes.length === 0 ? (
        <div className="carte etat-vide">
          <p>Aucun bénévole à accueillir dans votre périmètre.</p>
        </div>
      ) : (
        lignes.map((l) => (
          <section key={l.utilisateurId} className="carte" aria-labelledby={`suivi-${l.utilisateurId}`}>
            <div className="titre-page">
              <h2 id={`suivi-${l.utilisateurId}`} style={{ margin: 0 }}>
                {l.nomAffiche}
              </h2>
              <span className={`badge ${l.etapesTotal > 0 && l.etapesTerminees === l.etapesTotal ? 'badge-succes' : ''}`}>
                Parcours : {l.etapesTerminees}/{l.etapesTotal}
              </span>
            </div>
            <p className="aide">
              {l.organisation.nom} · arrivé(e) le {dateCourte(l.arriveeLe)}
            </p>
            {l.parrainage ? (
              <>
                <p>
                  Accompagné(e) par <strong>{l.parrainage.parrainNom}</strong>.
                </p>
                <PointsEtape parrainageId={l.parrainage.id} points={l.parrainage.points} gerer />
              </>
            ) : (
              <Formulaire action={designerParrain} libelle={`Désigner un parrain pour ${l.nomAffiche}`}>
                <input type="hidden" name="organisationId" value={l.organisation.id} />
                <input type="hidden" name="filleulId" value={l.utilisateurId} />
                <Champ
                  nom="parrainId"
                  libelle="Parrain ou marraine"
                  obligatoire
                  options={parrains.filter((p) => p.valeur !== l.utilisateurId)}
                />
                <div className="actions">
                  <BoutonEnvoi variante="secondaire">Désigner</BoutonEnvoi>
                </div>
              </Formulaire>
            )}
          </section>
        ))
      )}
    </>
  );
}
