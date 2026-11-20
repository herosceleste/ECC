import { Champ } from '@/composants/formulaire';
import { LIBELLES_STATUTS_LOGEMENT } from '@/lib/droits';
import type { Immeuble, Logement } from '@/lib/types';

const TYPOLOGIES = ['studio', 'chambre', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6'].map((t) => ({ valeur: t, libelle: t }));
const DPE = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((c) => ({ valeur: c, libelle: c }));
const STATUTS = Object.entries(LIBELLES_STATUTS_LOGEMENT).map(([valeur, libelle]) => ({ valeur, libelle }));

/** Champs communs à la création et à la modification d'un logement. */
export function ChampsLogement({ logement, immeubles }: { logement?: Logement; immeubles: Immeuble[] }) {
  return (
    <>
      <div className="ligne-champs">
        <Champ nom="reference" libelle="Référence" obligatoire valeur={logement?.reference} aide="Ex. : MAS-012" />
        <Champ nom="typologie" libelle="Typologie" obligatoire options={TYPOLOGIES} valeur={logement?.typologie} />
        <Champ nom="statut" libelle="Statut" obligatoire options={STATUTS} valeur={logement?.statut ?? 'DISPONIBLE'} />
      </div>
      <div className="ligne-champs">
        <Champ
          nom="surfaceM2"
          libelle="Surface (m²)"
          modeSaisie="decimal"
          aide="Ex. : 38,5"
          valeur={logement?.surfaceM2 ? String(Number(logement.surfaceM2)).replace('.', ',') : undefined}
        />
        <Champ nom="etage" libelle="Étage" type="number" min={-5} max={80} valeur={logement?.etage ?? undefined} />
        <Champ nom="classeDpe" libelle="Classe énergie (DPE)" options={DPE} valeur={logement?.classeDpe ?? undefined} />
      </div>
      <Champ
        nom="immeubleId"
        libelle="Immeuble"
        options={immeubles.map((i) => ({ valeur: i.id, libelle: `${i.ligneAdresse}, ${i.codePostal} ${i.commune}` }))}
        valeur={logement?.immeubleId ?? undefined}
      />
    </>
  );
}
