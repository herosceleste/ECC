import Link from 'next/link';
import { BoutonEnvoi, Champ, Formulaire } from '@/composants/formulaire';
import { dateCourte } from '@/lib/format';
import type { PointEtape } from '@/lib/types';
import { ajouterPoint, pointFait } from './actions';

type Onglet = 'parcours' | 'ressources' | 'engagements' | 'gestion' | 'suivi';

/** Onglets du module Intégration ; les deux derniers sont réservés à qui organise l'accueil. */
export function SousNavigationIntegration({ actif, editeur }: { actif: Onglet; editeur: boolean }) {
  const onglets: { cle: Onglet; href: string; libelle: string }[] = [
    { cle: 'parcours', href: '/integration', libelle: 'Mon parcours' },
    { cle: 'ressources', href: '/integration/ressources', libelle: 'Fiches, questions et contacts' },
    { cle: 'engagements', href: '/integration/engagements', libelle: 'Charte et engagements' },
    ...(editeur
      ? ([
          { cle: 'gestion', href: '/integration/gestion', libelle: 'Contenus' },
          { cle: 'suivi', href: '/integration/suivi', libelle: 'Nouveaux bénévoles' },
        ] as const)
      : []),
  ];
  return (
    <nav aria-label="Rubriques de l’intégration" className="actions" style={{ marginBottom: '1rem' }}>
      {onglets.map((o) => (
        <Link
          key={o.cle}
          href={o.href}
          aria-current={o.cle === actif ? 'page' : undefined}
          className={`bouton ${o.cle === actif ? '' : 'bouton-secondaire'}`}
        >
          {o.libelle}
        </Link>
      ))}
    </nav>
  );
}

/** Texte saisi par les éditeurs : affiché tel quel, paragraphes conservés, jamais interprété. */
export function Corps({ texte }: { texte: string }) {
  return (
    <>
      {texte.split(/\n{2,}/).map((paragraphe, i) => (
        <p key={i} style={{ whiteSpace: 'pre-line' }}>
          {paragraphe}
        </p>
      ))}
    </>
  );
}

/** Points d'étape d'un parrainage, avec planification et validation. */
export function PointsEtape({ parrainageId, points, gerer }: { parrainageId: string; points: PointEtape[]; gerer: boolean }) {
  return (
    <>
      {points.length === 0 ? (
        <p className="aide">Aucun point d’étape planifié.</p>
      ) : (
        <ul>
          {points.map((p) => (
            <li key={p.id}>
              {dateCourte(p.date)} {p.faitLe ? <span className="badge badge-succes">fait</span> : null}
              {gerer && !p.faitLe ? (
                <Formulaire action={pointFait} libelle={`Point du ${dateCourte(p.date)} fait`}>
                  <input type="hidden" name="id" value={p.id} />
                  <BoutonEnvoi variante="secondaire">C’est fait</BoutonEnvoi>
                </Formulaire>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {gerer ? (
        <Formulaire action={ajouterPoint} libelle="Planifier un point d’étape">
          <input type="hidden" name="parrainageId" value={parrainageId} />
          <Champ nom="date" libelle="Prochain point d’étape" type="date" obligatoire />
          <div className="actions">
            <BoutonEnvoi variante="secondaire">Planifier</BoutonEnvoi>
          </div>
        </Formulaire>
      ) : null}
    </>
  );
}
