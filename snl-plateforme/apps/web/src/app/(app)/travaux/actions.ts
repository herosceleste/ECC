'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { appelerApi, ErreurApi } from '@/lib/api';
import { executer, texte, type EtatAction } from '@/lib/actions';
import { enCentimes } from '@/lib/travaux';

const PHOTOS_MAX = 5;

/**
 * Signalement : l'intervention est créée d'abord, puis chaque photo est
 * déposée. Si une photo échoue (antivirus indisponible, format refusé), le
 * signalement reste enregistré et la page l'indique.
 */
export async function signaler(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  const photos = donnees.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (photos.length > PHOTOS_MAX) {
    return {
      statut: 'erreur',
      message: `Cinq photos au plus par signalement.`,
      erreurs: { photos: `${photos.length} photos choisies.` },
      jalon: Date.now(),
    };
  }

  let destination: string | undefined;
  const etat = await executer(donnees, async () => {
    const intervention = await appelerApi<{ id: string; urgent: boolean }>('/travaux/interventions', {
      methode: 'POST',
      corps: {
        logementId: texte(donnees, 'logementId'),
        categorie: texte(donnees, 'categorie'),
        description: texte(donnees, 'description') ?? '',
        urgenceSignalee: texte(donnees, 'urgence') === 'oui',
      },
    });

    let photosEnEchec = 0;
    for (const photo of photos) {
      const envoi = new FormData();
      envoi.set('entiteType', 'intervention');
      envoi.set('entiteId', intervention.id);
      envoi.set('categorie', 'photo');
      envoi.set('fichier', photo, photo.name);
      try {
        await appelerApi('/documents', { methode: 'POST', formulaire: envoi });
      } catch (erreur) {
        if (!(erreur instanceof ErreurApi)) throw erreur;
        photosEnEchec += 1;
      }
    }
    const parametres = new URLSearchParams({ cree: '1' });
    if (intervention.urgent) parametres.set('urgent', '1');
    if (photosEnEchec > 0) parametres.set('photos', String(photosEnEchec));
    destination = `/travaux/${intervention.id}?${parametres}`;
  });
  if (destination) redirect(destination);
  return etat;
}

export async function qualifier(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const id = texte(donnees, 'id');
    await appelerApi(`/travaux/interventions/${id}/qualification`, {
      methode: 'POST',
      corps: { priorite: texte(donnees, 'priorite'), nature: texte(donnees, 'nature') },
    });
    revalidatePath(`/travaux/${id}`);
    return 'La qualification est enregistrée.';
  });
}

export async function affecter(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const id = texte(donnees, 'id');
    const cible = texte(donnees, 'cible') ?? '';
    const [genre, cibleId] = cible.split(':');
    await appelerApi(`/travaux/interventions/${id}/affectation`, {
      methode: 'POST',
      corps: {
        utilisateurId: genre === 'personne' ? cibleId : null,
        artisanId: genre === 'artisan' ? cibleId : null,
        datePrevue: texte(donnees, 'datePrevue') ?? null,
      },
    });
    revalidatePath(`/travaux/${id}`);
    return cible ? 'L’intervention est confiée.' : 'L’affectation est retirée.';
  });
}

/**
 * Après un changement de statut, les boutons proposés changent : le message
 * de confirmation est donc affiché par la page (paramètre « etape »), et non
 * par le formulaire, qui disparaît.
 */
export async function changerStatut(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  const id = texte(donnees, 'id');
  const statut = texte(donnees, 'statut');
  const etat = await executer(donnees, async () => {
    await appelerApi(`/travaux/interventions/${id}/statut`, {
      methode: 'POST',
      corps: { statut, commentaire: texte(donnees, 'commentaire') },
    });
  });
  if (etat.statut === 'succes') redirect(`/travaux/${id}?etape=${statut}`);
  return etat;
}

export async function commenter(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const id = texte(donnees, 'id');
    await appelerApi(`/travaux/interventions/${id}/commentaires`, {
      methode: 'POST',
      corps: { texte: texte(donnees, 'texte') ?? '' },
    });
    revalidatePath(`/travaux/${id}`);
    return 'Commentaire ajouté.';
  });
}

export async function ajouterCout(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  const montantCentimes = enCentimes(texte(donnees, 'montant'));
  if (montantCentimes === null) {
    return {
      statut: 'erreur',
      message: 'Le montant n’est pas valide.',
      erreurs: { montant: 'Indiquez un montant en euros, par exemple 432,10.' },
      valeurs: { libelle: texte(donnees, 'libelle') ?? '', montant: texte(donnees, 'montant') ?? '' },
      jalon: Date.now(),
    };
  }
  return executer(donnees, async () => {
    const id = texte(donnees, 'id');
    await appelerApi(`/travaux/interventions/${id}/couts`, {
      methode: 'POST',
      corps: { type: texte(donnees, 'type'), libelle: texte(donnees, 'libelle') ?? '', montantCentimes },
    });
    revalidatePath(`/travaux/${id}`);
    return 'Montant enregistré.';
  });
}

export async function creerArtisan(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi('/travaux/artisans', {
      methode: 'POST',
      corps: {
        organisationId: texte(donnees, 'organisationId'),
        raisonSociale: texte(donnees, 'raisonSociale') ?? '',
        siret: texte(donnees, 'siret')?.replace(/\s/g, '') ?? null,
        specialites: donnees.getAll('specialites').filter((v): v is string => typeof v === 'string'),
        telephone: texte(donnees, 'telephone') ?? null,
        email: texte(donnees, 'email') ?? null,
      },
    });
    revalidatePath('/travaux/artisans');
    return 'L’artisan est ajouté au carnet.';
  });
}

export async function creerEntretien(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi('/travaux/entretiens', {
      methode: 'POST',
      corps: {
        logementId: texte(donnees, 'logementId'),
        libelle: texte(donnees, 'libelle') ?? '',
        categorie: texte(donnees, 'categorie'),
        periodiciteMois: Number(texte(donnees, 'periodiciteMois')),
        prochaineEcheance: texte(donnees, 'prochaineEcheance'),
      },
    });
    revalidatePath('/travaux/entretiens');
    return 'L’entretien est programmé.';
  });
}

export async function lancerEntretien(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  let id: string | undefined;
  const etat = await executer(donnees, async () => {
    const intervention = await appelerApi<{ id: string }>(`/travaux/entretiens/${texte(donnees, 'id')}/intervention`, {
      methode: 'POST',
    });
    id = intervention.id;
  });
  if (id) redirect(`/travaux/${id}`);
  return etat;
}

export async function entretienRealise(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    await appelerApi(`/travaux/entretiens/${texte(donnees, 'id')}/realisation`, {
      methode: 'POST',
      corps: { date: texte(donnees, 'date') ?? new Date().toISOString().slice(0, 10) },
    });
    revalidatePath('/travaux/entretiens');
    return 'Réalisation enregistrée ; la prochaine échéance est recalculée.';
  });
}
