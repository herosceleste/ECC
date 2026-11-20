'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { appelerApi } from '@/lib/api';
import { config } from '@/lib/config';
import { ecrireSession, lireSession } from '@/lib/session';
import type { Espace } from '@/lib/types';

/** Enregistre l'association choisie dans la session, après vérification auprès de l'API. */
export async function choisirEspace(donnees: FormData): Promise<void> {
  const associationId = donnees.get('associationId');
  const espaces = await appelerApi<Espace[]>('/moi/espaces', { sansAssociation: true });
  if (typeof associationId !== 'string' || !espaces.some((e) => e.tenant_id === associationId)) {
    redirect('/espaces?erreur=1');
  }
  const c = config();
  const magasin = await cookies();
  const session = await lireSession(magasin, c.SECRET_SESSION);
  if (!session) redirect('/connexion');
  await ecrireSession(magasin, { ...session, associationId }, c.SECRET_SESSION, c.URL_PUBLIQUE_WEB.startsWith('https://'));
  redirect('/accueil');
}
