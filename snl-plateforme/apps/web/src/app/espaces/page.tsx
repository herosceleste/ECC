import type { Metadata } from 'next';
import { chargerEspaces, chargerMoi } from '@/lib/contexte';
import { LIBELLES_ROLES } from '@/lib/droits';
import type { Espace } from '@/lib/types';
import { choisirEspace } from './actions';

export const metadata: Metadata = { title: 'Choisir mon espace' };

export default async function Espaces({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const [moi, espaces, parametres] = await Promise.all([chargerMoi(), chargerEspaces(), searchParams]);
  const parAssociation = new Map<string, Espace[]>();
  for (const espace of espaces) {
    parAssociation.set(espace.tenant_id, [...(parAssociation.get(espace.tenant_id) ?? []), espace]);
  }

  return (
    <main id="contenu" className="page-centree">
      <h1>Bonjour {moi.nomAffiche}</h1>
      <p className="chapo">Choisissez l’association dans laquelle vous souhaitez travailler.</p>
      {parametres.erreur ? (
        <div className="alerte alerte-erreur" role="alert">
          <p>Cet espace n’est pas disponible pour votre compte.</p>
        </div>
      ) : null}

      {parAssociation.size === 0 ? (
        <div className="carte etat-vide">
          <p>Votre compte n’est rattaché à aucune association pour le moment.</p>
          <p>Contactez le coordinateur qui vous a invité.</p>
        </div>
      ) : (
        [...parAssociation.entries()].map(([associationId, lignes]) => (
          <form key={associationId} action={choisirEspace} className="carte">
            <input type="hidden" name="associationId" value={associationId} />
            <h2>{lignes[0]?.association_nom}</h2>
            <ul>
              {lignes.map((l) => (
                <li key={`${l.organisation_id}-${l.role}`}>
                  {LIBELLES_ROLES[l.role] ?? l.role} · {l.organisation_nom}
                </li>
              ))}
            </ul>
            <button type="submit" className="bouton">
              Entrer dans cet espace
            </button>
          </form>
        ))
      )}

      <form action="/auth/deconnexion" method="post">
        <button type="submit" className="bouton-lien">
          Se déconnecter
        </button>
      </form>
    </main>
  );
}
