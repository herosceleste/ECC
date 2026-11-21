import Link from 'next/link';
import { BoutonEnvoi, Formulaire } from '@/composants/formulaire';
import type { Activite } from '@/lib/types';
import { agirSurActivite } from './actions';

/** Onglets du module Bénévoles. */
export function SousNavigationBenevoles({ actif }: { actif: 'planning' | 'annuaire' | 'profil' }) {
  const onglets = [
    { cle: 'planning', href: '/benevoles', libelle: 'Planning' },
    { cle: 'annuaire', href: '/benevoles/annuaire', libelle: 'Annuaire' },
    { cle: 'profil', href: '/benevoles/profil', libelle: 'Mon profil et mes disponibilités' },
  ] as const;
  return (
    <nav aria-label="Rubriques des bénévoles" className="actions" style={{ marginBottom: '1rem' }}>
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

/** Bouton d'inscription ou de désistement, selon ma situation. */
export function ActionParticipation({ activite, retour }: { activite: Activite; retour: string }) {
  if (activite.annuleeLe || new Date(activite.debut) <= new Date()) return null;
  const inscrit = activite.monStatut === 'INSCRIT' || activite.monStatut === 'LISTE_ATTENTE';
  const complet = activite.places !== null && activite.inscrits >= activite.places;
  return (
    <Formulaire action={agirSurActivite} libelle={`${inscrit ? 'Se désister de' : 'S’inscrire à'} ${activite.titre}`}>
      <input type="hidden" name="id" value={activite.id} />
      <input type="hidden" name="geste" value={inscrit ? 'desister' : 'inscrire'} />
      <input type="hidden" name="retour" value={retour} />
      <BoutonEnvoi variante={inscrit ? 'danger' : undefined}>
        {inscrit ? 'Me désister' : complet ? 'Rejoindre la liste d’attente' : 'Je m’inscris'}
      </BoutonEnvoi>
    </Formulaire>
  );
}

export function EtatParticipation({ statut }: { statut: Activite['monStatut'] }) {
  if (statut === 'INSCRIT') return <span className="badge badge-succes">Inscrit</span>;
  if (statut === 'LISTE_ATTENTE') return <span className="badge badge-alerte">En liste d’attente</span>;
  return null;
}

/** Message de confirmation après une inscription, un désistement ou une annulation. */
export function MessageGeste({ geste }: { geste?: string }) {
  const messages: Record<string, string> = {
    inscrire: 'C’est noté. Vous recevrez un rappel la veille.',
    desister: 'Votre désistement est enregistré ; la coordination est prévenue.',
    annuler: 'L’activité est annulée ; les inscrits sont prévenus.',
  };
  const message = geste ? messages[geste] : undefined;
  return message ? (
    <div className="alerte alerte-succes" role="status">
      <p>{message}</p>
    </div>
  ) : null;
}
