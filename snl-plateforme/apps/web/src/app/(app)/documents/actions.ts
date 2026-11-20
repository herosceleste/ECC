'use server';

import { revalidatePath } from 'next/cache';
import { appelerApi, ErreurApi } from '@/lib/api';
import { executer, texte, type EtatAction } from '@/lib/actions';

const TAILLE_MAX = 15 * 1024 * 1024;

/** Transmet le fichier à l'API, qui vérifie son type réel et l'analyse avant stockage. */
export async function deposerDocument(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const fichier = donnees.get('fichier');
    if (!(fichier instanceof File) || fichier.size === 0) {
      throw new ErreurApi(400, 'Choisissez un fichier à déposer.', [{ champ: 'fichier', message: 'Fichier manquant.' }]);
    }
    if (fichier.size > TAILLE_MAX) {
      throw new ErreurApi(413, 'Le fichier dépasse 15 Mo.', [{ champ: 'fichier', message: 'Fichier trop volumineux.' }]);
    }
    const envoi = new FormData();
    envoi.set('entiteType', texte(donnees, 'entiteType') ?? '');
    envoi.set('entiteId', texte(donnees, 'entiteId') ?? '');
    envoi.set('categorie', texte(donnees, 'categorie') ?? '');
    envoi.set('fichier', fichier, fichier.name);
    await appelerApi('/documents', { methode: 'POST', formulaire: envoi });
    revalidatePath(texte(donnees, 'page') ?? '/');
    return `« ${fichier.name} » a été déposé.`;
  });
}

export async function supprimerDocument(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi(`/documents/${texte(donnees, 'id')}`, { methode: 'DELETE' });
    revalidatePath(texte(donnees, 'page') ?? '/');
    return 'Document supprimé.';
  });
}
