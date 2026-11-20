'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { appelerApi } from '@/lib/api';
import { executer, texte, type EtatAction } from '@/lib/actions';
import type { Menage, Personne } from '@/lib/types';

export async function creerMenage(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  let id: string | undefined;
  const etat = await executer(donnees, async () => {
    const menage = await appelerApi<Menage>('/menages', {
      methode: 'POST',
      corps: { organisationId: texte(donnees, 'organisationId'), libelle: texte(donnees, 'libelle') ?? '' },
    });
    id = menage.id;
  });
  if (id) redirect(`/menages/${id}`);
  return etat;
}

function champsPersonne(donnees: FormData) {
  return {
    nom: texte(donnees, 'nom') ?? '',
    prenom: texte(donnees, 'prenom') ?? '',
    dateNaissance: texte(donnees, 'dateNaissance') ?? null,
    telephone: texte(donnees, 'telephone') ?? null,
    email: texte(donnees, 'email') ?? null,
  };
}

/** Ajoute une personne ; un doublon probable est signalé, et peut être confirmé ensuite. */
export async function ajouterPersonne(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const personne = await appelerApi<Personne>('/personnes', {
      methode: 'POST',
      corps: {
        organisationId: texte(donnees, 'organisationId'),
        menageId: texte(donnees, 'menageId') ?? null,
        ...champsPersonne(donnees),
        confirmerMalgreDoublon: texte(donnees, 'confirmer') === 'oui',
      },
    });
    revalidatePath(`/menages/${texte(donnees, 'menageId')}`);
    return `${personne.prenom} ${personne.nom} a été ajouté(e) au ménage.`;
  });
}

export async function modifierPersonne(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const id = texte(donnees, 'id');
    await appelerApi(`/personnes/${id}`, { methode: 'PATCH', corps: champsPersonne(donnees) });
    revalidatePath(`/personnes/${id}`);
    return 'Les informations ont été mises à jour.';
  });
}

export async function enregistrerDonneesSensibles(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  return executer(donnees, async () => {
    const id = texte(donnees, 'id');
    const ressources = texte(donnees, 'ressourcesMensuelles');
    await appelerApi(`/personnes/${id}/donnees-sensibles`, {
      methode: 'PUT',
      corps: {
        ressourcesMensuelles: ressources === undefined ? null : Number(ressources.replace(',', '.')),
        natureRessources: texte(donnees, 'natureRessources') ?? null,
        situationProfessionnelle: texte(donnees, 'situationProfessionnelle') ?? null,
      },
    });
    return 'Les données sensibles ont été enregistrées (chiffrées).';
  });
}

export async function supprimerPersonne(_etat: EtatAction, donnees: FormData): Promise<EtatAction> {
  if (texte(donnees, 'confirmation') !== 'oui') {
    return {
      statut: 'erreur',
      message: 'Cochez la case de confirmation pour supprimer la fiche.',
      erreurs: { confirmation: 'Confirmation requise.' },
      jalon: Date.now(),
    };
  }
  let menageId: string | undefined;
  const etat = await executer(donnees, async () => {
    await appelerApi(`/personnes/${texte(donnees, 'id')}`, { methode: 'DELETE' });
    menageId = texte(donnees, 'menageId');
  });
  if (etat.statut === 'succes') redirect(menageId ? `/menages/${menageId}?supprime=1` : '/menages');
  return etat;
}
