'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { appelerApi } from '@/lib/api';
import { executer, texte, type EtatAction } from '@/lib/actions';
import { enListe } from '@/lib/benevoles';
import { instantParis } from '@/lib/format';
import { retourSur } from '@/lib/session';

export async function creerActivite(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  const date = texte(donnees, 'date');
  const debut = instantParis(date, texte(donnees, 'heureDebut'));
  const fin = instantParis(date, texte(donnees, 'heureFin'));
  if (!debut || !fin) {
    return {
      statut: 'erreur',
      message: 'Indiquez la date et les heures de début et de fin.',
      erreurs: { ...(debut ? {} : { heureDebut: 'Heure manquante.' }), ...(fin ? {} : { heureFin: 'Heure manquante.' }) },
      valeurs: Object.fromEntries([...donnees.entries()].filter(([, v]) => typeof v === 'string')) as Record<string, string>,
      jalon: Date.now(),
    };
  }
  let id: string | undefined;
  const etat = await executer(donnees, async () => {
    const places = texte(donnees, 'places');
    const activite = await appelerApi<{ id: string }>('/benevoles/activites', {
      methode: 'POST',
      corps: {
        organisationId: texte(donnees, 'organisationId'),
        type: texte(donnees, 'type'),
        titre: texte(donnees, 'titre') ?? '',
        description: texte(donnees, 'description') ?? null,
        lieu: texte(donnees, 'lieu') ?? null,
        debut,
        fin,
        places: places ? Number(places) : null,
        interventionId: texte(donnees, 'interventionId') ?? null,
      },
    });
    id = activite.id;
  });
  if (id) redirect(`/benevoles/activites/${id}?cree=1`);
  return etat;
}

/** Inscription, désistement ou annulation : la page affiche le résultat (les boutons changent). */
export async function agirSurActivite(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  const id = texte(donnees, 'id');
  const geste = texte(donnees, 'geste');
  const chemins: Record<string, string> = { inscrire: 'inscription', desister: 'desistement', annuler: 'annulation' };
  const etat = await executer(donnees, async () => {
    await appelerApi(`/benevoles/activites/${id}/${chemins[geste ?? ''] ?? 'inscription'}`, { methode: 'POST' });
  });
  if (etat.statut === 'succes') {
    revalidatePath('/benevoles');
    // Retour sur la page d'origine, jamais vers une adresse extérieure.
    const retour = retourSur(texte(donnees, 'retour') ?? `/benevoles/activites/${id}`);
    redirect(`${retour}${retour.includes('?') ? '&' : '?'}fait=${geste}`);
  }
  return etat;
}

export async function modifierProfil(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi('/benevoles/moi/profil', {
      methode: 'PUT',
      corps: {
        telephone: texte(donnees, 'telephone') ?? null,
        telephoneMasque: texte(donnees, 'telephoneMasque') === 'oui',
        competences: enListe(texte(donnees, 'competences')),
        centresInteret: enListe(texte(donnees, 'centresInteret')),
        dateArrivee: texte(donnees, 'dateArrivee') ?? null,
      },
    });
    revalidatePath('/benevoles/profil');
    return 'Votre profil est enregistré.';
  });
}

export async function ajouterDisponibilite(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const recurrente = texte(donnees, 'genre') !== 'ponctuelle';
    await appelerApi('/benevoles/moi/disponibilites', {
      methode: 'POST',
      corps: {
        jourSemaine: recurrente ? Number(texte(donnees, 'jourSemaine')) : null,
        date: recurrente ? null : (texte(donnees, 'date') ?? null),
        heureDebut: texte(donnees, 'heureDebut') ?? '',
        heureFin: texte(donnees, 'heureFin') ?? '',
        commentaire: texte(donnees, 'commentaire') ?? null,
      },
    });
    revalidatePath('/benevoles/profil');
    return 'Disponibilité ajoutée.';
  });
}

export async function supprimerDisponibilite(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi(`/benevoles/moi/disponibilites/${texte(donnees, 'id')}`, { methode: 'DELETE' });
    revalidatePath('/benevoles/profil');
    return 'Disponibilité retirée.';
  });
}

export async function ajouterReferent(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const menageId = texte(donnees, 'menageId');
    await appelerApi(`/benevoles/menages/${menageId}/referents`, {
      methode: 'POST',
      corps: { utilisateurId: texte(donnees, 'utilisateurId') },
    });
    revalidatePath(`/menages/${menageId}`);
    return 'Référent ajouté.';
  });
}

export async function retirerReferent(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi(`/benevoles/referents/${texte(donnees, 'id')}`, { methode: 'DELETE' });
    revalidatePath(`/menages/${texte(donnees, 'menageId')}`);
    return 'Référent retiré.';
  });
}
