'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { appelerApi } from '@/lib/api';
import { executer, texte, type EtatAction } from '@/lib/actions';
import { retourSur } from '@/lib/session';

export async function marquerEtape(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const terminee = texte(donnees, 'terminee') === 'oui';
    await appelerApi(`/integration/etapes/${texte(donnees, 'id')}`, { methode: 'POST', corps: { terminee } });
    revalidatePath('/integration');
    return terminee ? 'Bravo, étape terminée.' : 'Étape remise à faire.';
  });
}

/** Signature d'un engagement : la case « j'ai lu et j'accepte » est obligatoire. */
export async function signerEngagement(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  if (texte(donnees, 'accepte') !== 'oui') {
    return {
      statut: 'erreur',
      message: 'Cochez la case pour confirmer que vous avez lu le texte et l’acceptez.',
      erreurs: { accepte: 'Confirmation requise.' },
      jalon: Date.now(),
    };
  }
  const etat = await executer(donnees, async () => {
    await appelerApi(`/integration/engagements/${texte(donnees, 'type')}/signature`, {
      methode: 'POST',
      corps: { empreinte: texte(donnees, 'empreinte'), accepte: true },
    });
  });
  if (etat.statut === 'succes') {
    revalidatePath('/integration');
    const retour = texte(donnees, 'retour');
    redirect(retour ? retourSur(retour) : '/integration/engagements?signe=1');
  }
  return etat;
}

function champsContenu(donnees: FormData) {
  return {
    titre: texte(donnees, 'titre') ?? '',
    corps: texte(donnees, 'corps') ?? '',
    lienVideo: texte(donnees, 'lienVideo') ?? null,
    ordre: Number(texte(donnees, 'ordre') ?? 0) || 0,
    publie: texte(donnees, 'publie') === 'oui',
  };
}

export async function creerContenu(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi('/integration/contenus', {
      methode: 'POST',
      corps: { organisationId: texte(donnees, 'organisationId'), type: texte(donnees, 'type'), ...champsContenu(donnees) },
    });
    revalidatePath('/integration/gestion');
    return 'Contenu enregistré.';
  });
}

export async function modifierContenu(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  const etat = await executer(donnees, async () => {
    await appelerApi(`/integration/contenus/${texte(donnees, 'id')}`, { methode: 'PATCH', corps: champsContenu(donnees) });
  });
  if (etat.statut === 'succes') redirect('/integration/gestion?modifie=1');
  return etat;
}

export async function supprimerContenu(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi(`/integration/contenus/${texte(donnees, 'id')}`, { methode: 'DELETE' });
    revalidatePath('/integration/gestion');
    return 'Contenu supprimé.';
  });
}

/** Le formulaire disparaît une fois le parrain désigné : la page affiche la confirmation. */
export async function designerParrain(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  const etat = await executer(donnees, async () => {
    await appelerApi('/integration/parrainages', {
      methode: 'POST',
      corps: {
        organisationId: texte(donnees, 'organisationId'),
        filleulId: texte(donnees, 'filleulId'),
        parrainId: texte(donnees, 'parrainId'),
      },
    });
  });
  if (etat.statut === 'succes') redirect('/integration/suivi?designe=1');
  return etat;
}

export async function ajouterPoint(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi(`/integration/parrainages/${texte(donnees, 'parrainageId')}/points`, {
      methode: 'POST',
      corps: { date: texte(donnees, 'date') },
    });
    revalidatePath('/integration');
    revalidatePath('/integration/suivi');
    return 'Point d’étape planifié.';
  });
}

export async function pointFait(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi(`/integration/points/${texte(donnees, 'id')}/fait`, { methode: 'POST' });
    revalidatePath('/integration');
    revalidatePath('/integration/suivi');
    return 'Point d’étape noté comme fait.';
  });
}
