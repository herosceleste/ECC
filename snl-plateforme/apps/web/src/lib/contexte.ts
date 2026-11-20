import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { appelerApi } from './api';
import { config } from './config';
import { lireSession } from './session';
import type { Espace, Moi, Organisation } from './types';

/** Chargements partagés par les composants d'une même requête (une seule fois chacun). */

export const sessionCourante = cache(async () => lireSession(await cookies(), config().SECRET_SESSION));

export const chargerMoi = cache(() => appelerApi<Moi>('/moi', { sansAssociation: true }));

export const chargerEspaces = cache(() => appelerApi<Espace[]>('/moi/espaces', { sansAssociation: true }));

export const chargerOrganisations = cache(() => appelerApi<Organisation[]>('/organisations'));

/** Nom des organisations visibles, pour afficher un libellé au lieu d'un identifiant. */
export const nomsOrganisations = cache(async () => {
  const organisations = await chargerOrganisations();
  return new Map(organisations.map((o) => [o.id, o.nom]));
});

/** Organisation et chemin, pour vérifier un droit sur une entité. */
export const cheminsOrganisations = cache(async () => {
  const organisations = await chargerOrganisations();
  return new Map(organisations.map((o) => [o.id, o.chemin]));
});
