'use client';

import {
  createContext,
  useActionState,
  useContext,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { useFormStatus } from 'react-dom';
import type { EtatAction } from '@/lib/actions';

type Action = (etat: EtatAction, donnees: FormData) => Promise<EtatAction>;

interface ContexteChamps {
  erreurs: Record<string, string>;
  valeurs: Record<string, string>;
  jalon: number;
}

const ContexteFormulaire = createContext<ContexteChamps>({ erreurs: {}, valeurs: {}, jalon: 0 });

interface PropsFormulaire {
  action: Action;
  children: ReactNode;
  /** Vider les champs après un succès (formulaires d'ajout). */
  viderApresSucces?: boolean;
  /** Contenu affiché sous le message d'erreur, selon l'état (ex. : doublons). */
  complement?: (etat: EtatAction) => ReactNode;
  libelle?: string;
}

/**
 * Formulaire relié à une action serveur. Fonctionne sans JavaScript ; avec
 * JavaScript, le message de résultat est annoncé aux lecteurs d'écran et le
 * focus est placé dessus en cas d'erreur.
 */
export function Formulaire({ action, children, viderApresSucces, complement, libelle }: PropsFormulaire) {
  const [etat, envoyer] = useActionState(action, { statut: 'repos' });
  const formulaire = useRef<HTMLFormElement>(null);
  const message = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (etat.statut === 'erreur') message.current?.focus();
    if (etat.statut === 'succes' && viderApresSucces) formulaire.current?.reset();
  }, [etat.jalon, etat.statut, viderApresSucces]);

  return (
    <form ref={formulaire} action={envoyer} className="formulaire" aria-label={libelle} noValidate>
      <div ref={message} tabIndex={-1} aria-live="polite">
        {etat.statut !== 'repos' && etat.message ? (
          <div className={`alerte ${etat.statut === 'succes' ? 'alerte-succes' : 'alerte-erreur'}`} role="status">
            <p>{etat.message}</p>
            {complement?.(etat)}
          </div>
        ) : null}
      </div>
      <ContexteFormulaire.Provider
        value={{
          erreurs: etat.erreurs ?? {},
          valeurs: etat.statut === 'erreur' ? (etat.valeurs ?? {}) : {},
          jalon: etat.jalon ?? 0,
        }}
      >
        {children}
      </ContexteFormulaire.Provider>
    </form>
  );
}

interface PropsChamp {
  nom: string;
  libelle: string;
  type?: string;
  aide?: string;
  obligatoire?: boolean;
  valeur?: string | number | null;
  options?: { valeur: string; libelle: string }[];
  autoComplete?: string;
  min?: number;
  max?: number;
  pas?: string;
  /** Clavier proposé sur mobile ; « decimal » accepte la virgule française. */
  modeSaisie?: 'decimal' | 'numeric';
  /** Pour les fichiers : plusieurs à la fois, et types proposés. */
  multiple?: boolean;
  accepte?: string;
}

/** Champ libellé, avec aide et message d'erreur reliés par aria-describedby. */
export function Champ({
  nom,
  libelle,
  type = 'text',
  aide,
  obligatoire,
  valeur,
  options,
  autoComplete,
  min,
  max,
  pas,
  modeSaisie,
  multiple,
  accepte,
}: PropsChamp) {
  const id = useId();
  const contexte = useContext(ContexteFormulaire);
  const erreur = contexte.erreurs[nom];
  // Après une erreur, on réaffiche la saisie (React vide le formulaire après chaque envoi).
  const valeurAffichee = type === 'file' ? undefined : (contexte.valeurs[nom] ?? valeur ?? undefined);
  const decrit = [aide ? `${id}-aide` : null, erreur ? `${id}-erreur` : null].filter(Boolean).join(' ') || undefined;
  const communs = {
    id,
    name: nom,
    required: obligatoire,
    'aria-invalid': erreur ? true : undefined,
    'aria-describedby': decrit,
    defaultValue: valeurAffichee,
  };
  const cle = `${nom}-${contexte.jalon}`;

  return (
    <div className="champ">
      <label htmlFor={id}>
        {libelle}
        {obligatoire ? <span aria-hidden="true"> *</span> : <span className="aide"> (facultatif)</span>}
      </label>
      {aide ? (
        <span id={`${id}-aide`} className="aide">
          {aide}
        </span>
      ) : null}
      {options ? (
        <select key={cle} {...communs}>
          {obligatoire ? null : <option value="">—</option>}
          {options.map((o) => (
            <option key={o.valeur} value={o.valeur}>
              {o.libelle}
            </option>
          ))}
        </select>
      ) : type === 'textarea' ? (
        <textarea key={cle} {...communs} rows={4} />
      ) : (
        <input
          key={cle}
          {...communs}
          type={type}
          inputMode={modeSaisie}
          multiple={multiple}
          accept={accepte}
          autoComplete={autoComplete}
          min={min}
          max={max}
          step={pas}
        />
      )}
      {erreur ? (
        <span id={`${id}-erreur`} className="message-champ">
          {erreur}
        </span>
      ) : null}
    </div>
  );
}

export function BoutonEnvoi({
  children,
  variante,
  nom,
  valeur,
}: {
  children: ReactNode;
  variante?: 'secondaire' | 'danger';
  nom?: string;
  valeur?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={`bouton${variante ? ` bouton-${variante}` : ''}`}
      disabled={pending}
      aria-disabled={pending}
      name={nom}
      value={valeur}
    >
      {pending ? 'Envoi en cours…' : children}
    </button>
  );
}
