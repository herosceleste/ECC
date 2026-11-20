'use server';

import { revalidatePath } from 'next/cache';
import { appelerApi } from '@/lib/api';
import { executer, texte, type EtatAction } from '@/lib/actions';
import { identifiantCourt } from '@/lib/format';

export async function creerOrganisation(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const nom = texte(donnees, 'nom') ?? '';
    await appelerApi('/organisations', {
      methode: 'POST',
      corps: {
        parentId: texte(donnees, 'parentId'),
        type: texte(donnees, 'type'),
        nom,
        slug: texte(donnees, 'slug') ?? identifiantCourt(nom),
      },
    });
    revalidatePath('/organisations');
    return `« ${nom} » a été créé.`;
  });
}

export async function renommerOrganisation(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const id = texte(donnees, 'id');
    await appelerApi(`/organisations/${id}`, { methode: 'PATCH', corps: { nom: texte(donnees, 'nom') } });
    revalidatePath(`/organisations/${id}`);
    return 'Le nom a été modifié.';
  });
}

export async function definirModule(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const id = texte(donnees, 'organisationId');
    const code = texte(donnees, 'code');
    const active = texte(donnees, 'active') === 'oui';
    await appelerApi(`/organisations/${id}/modules/${code}`, { methode: 'PUT', corps: { active } });
    revalidatePath(`/organisations/${id}`);
    return active ? `Module ${code} activé.` : `Module ${code} désactivé.`;
  });
}
