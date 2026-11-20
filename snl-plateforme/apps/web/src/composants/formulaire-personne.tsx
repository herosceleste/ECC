'use client';

import Link from 'next/link';
import type { EtatAction } from '@/lib/actions';
import { BoutonEnvoi, Champ, Formulaire } from './formulaire';

interface Doublon {
  id: string;
  nom: string;
  prenom: string;
}

interface Props {
  action: (etat: EtatAction, donnees: FormData) => Promise<EtatAction>;
  organisationId: string;
  menageId: string;
}

/**
 * Ajout d'une personne. Si l'API signale un doublon probable, les fiches
 * proches sont listées et une case permet de confirmer qu'il s'agit bien
 * d'une autre personne (règle M0-R01).
 */
export function FormulairePersonne({ action, organisationId, menageId }: Props) {
  return (
    <Formulaire
      action={action}
      viderApresSucces
      libelle="Ajouter une personne"
      complement={(etat) => {
        if (etat.code !== 'DOUBLON_PROBABLE') return null;
        const doublons = (etat.details?.doublons ?? []) as Doublon[];
        return (
          <>
            {doublons.length > 0 ? (
              <ul>
                {doublons.map((d) => (
                  <li key={d.id}>
                    <Link href={`/personnes/${d.id}`}>
                      {d.prenom} {d.nom}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <label className="case">
              <input type="checkbox" name="confirmer" value="oui" />
              Je confirme qu’il s’agit d’une autre personne
            </label>
          </>
        );
      }}
    >
      <input type="hidden" name="organisationId" value={organisationId} />
      <input type="hidden" name="menageId" value={menageId} />
      <div className="ligne-champs">
        <Champ nom="prenom" libelle="Prénom" obligatoire autoComplete="off" />
        <Champ nom="nom" libelle="Nom" obligatoire autoComplete="off" />
      </div>
      <div className="ligne-champs">
        <Champ nom="dateNaissance" libelle="Date de naissance" type="date" />
        <Champ nom="telephone" libelle="Téléphone" type="tel" autoComplete="off" />
        <Champ nom="email" libelle="Courriel" type="email" autoComplete="off" />
      </div>
      <div className="actions">
        <BoutonEnvoi>Ajouter la personne</BoutonEnvoi>
      </div>
    </Formulaire>
  );
}
