'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { appelerApi } from '@/lib/api';
import { executer, nombre, texte, type EtatAction } from '@/lib/actions';
import type { Immeuble, Logement } from '@/lib/types';

function champsLogement(donnees: FormData) {
  return {
    immeubleId: texte(donnees, 'immeubleId') ?? null,
    reference: texte(donnees, 'reference') ?? '',
    typologie: texte(donnees, 'typologie') ?? '',
    surfaceM2: nombre(donnees, 'surfaceM2'),
    etage: nombre(donnees, 'etage'),
    classeDpe: texte(donnees, 'classeDpe') ?? null,
    statut: texte(donnees, 'statut'),
  };
}

export async function creerLogement(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  let id: string | undefined;
  const etat = await executer(donnees, async () => {
    const logement = await appelerApi<Logement>('/logements', {
      methode: 'POST',
      corps: { organisationId: texte(donnees, 'organisationId'), ...champsLogement(donnees) },
    });
    id = logement.id;
  });
  if (id) redirect(`/logements/${id}?cree=1`);
  return etat;
}

export async function modifierLogement(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const id = texte(donnees, 'id');
    await appelerApi(`/logements/${id}`, { methode: 'PATCH', corps: champsLogement(donnees) });
    revalidatePath(`/logements/${id}`);
    return 'Le logement a été mis à jour.';
  });
}

export async function creerImmeuble(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const immeuble = await appelerApi<Immeuble>('/immeubles', {
      methode: 'POST',
      corps: {
        organisationId: texte(donnees, 'organisationId'),
        ligneAdresse: texte(donnees, 'ligneAdresse') ?? '',
        codePostal: texte(donnees, 'codePostal') ?? '',
        commune: texte(donnees, 'commune') ?? '',
      },
    });
    revalidatePath('/logements/nouveau');
    return `L’immeuble du ${immeuble.ligneAdresse} est disponible dans la liste.`;
  });
}
