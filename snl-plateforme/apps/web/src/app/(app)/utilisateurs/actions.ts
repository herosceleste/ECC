'use server';

import { revalidatePath } from 'next/cache';
import { appelerApi } from '@/lib/api';
import { executer, texte, type EtatAction } from '@/lib/actions';

export async function inviter(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const email = texte(donnees, 'email') ?? '';
    await appelerApi('/utilisateurs/invitations', {
      methode: 'POST',
      corps: {
        email,
        nomAffiche: texte(donnees, 'nomAffiche') ?? '',
        organisationId: texte(donnees, 'organisationId'),
        role: texte(donnees, 'role'),
      },
    });
    revalidatePath('/utilisateurs');
    return `L’invitation a été envoyée à ${email}.`;
  });
}

export async function retirerRole(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi(`/adhesions/${texte(donnees, 'adhesionId')}`, { methode: 'DELETE' });
    revalidatePath('/utilisateurs');
    return 'Le rôle a été retiré.';
  });
}

export async function changerStatut(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const suspendre = texte(donnees, 'operation') === 'suspension';
    await appelerApi(`/utilisateurs/${texte(donnees, 'utilisateurId')}/${suspendre ? 'suspension' : 'reactivation'}`, {
      methode: 'POST',
    });
    revalidatePath('/utilisateurs');
    return suspendre ? 'Le compte est suspendu.' : 'Le compte est réactivé.';
  });
}
