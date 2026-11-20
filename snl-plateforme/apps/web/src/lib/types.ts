import type { CodeModule, Role } from '@snl/shared';

/** Formes des réponses de l'API du socle, telles que l'interface les utilise. */

export interface Adhesion {
  organisationId: string;
  chemin: string;
  role: Role;
}

export interface Moi {
  id: string;
  email: string;
  nomAffiche: string;
  secondFacteur: boolean;
  associationId: string | null;
  adhesions: Adhesion[];
}

export interface Espace {
  tenant_id: string;
  association_nom: string;
  organisation_id: string;
  organisation_nom: string;
  role: Role;
}

export type TypeOrganisation = 'ASSOCIATION' | 'ANTENNE' | 'GROUPE_LOCAL';

export interface Organisation {
  id: string;
  parentId: string | null;
  type: TypeOrganisation;
  nom: string;
  slug: string;
  chemin: string;
}

export interface EtatModule {
  code: CodeModule;
  libelle: string;
  active: boolean;
  regleSur: string | null;
}

export type StatutLogement = 'DISPONIBLE' | 'OCCUPE' | 'EN_TRAVAUX' | 'HORS_PARC';

export interface Immeuble {
  id: string;
  organisationId: string;
  ligneAdresse: string;
  codePostal: string;
  commune: string;
}

export interface Logement {
  id: string;
  organisationId: string;
  immeubleId: string | null;
  reference: string;
  typologie: string;
  surfaceM2: string | null;
  etage: number | null;
  classeDpe: string | null;
  statut: StatutLogement;
  immeuble: Immeuble | null;
}

export interface Personne {
  id: string;
  organisationId: string;
  menageId: string | null;
  nom: string;
  prenom: string;
  dateNaissance: string | null;
  telephone: string | null;
  email: string | null;
}

export interface Menage {
  id: string;
  organisationId: string;
  libelle: string;
  personnes?: Personne[];
}

export interface DocumentInfo {
  id: string;
  categorie: string;
  nomFichier: string;
  typeMime: string;
  tailleOctets: number;
  version: number;
  creeLe: string;
}

export interface Membre {
  adhesionId: string;
  role: Role;
  organisation: { id: string; nom: string };
  utilisateur: { id: string; email: string; nomAffiche: string; statut: 'INVITE' | 'ACTIF' | 'SUSPENDU' };
}

export interface EvenementAudit {
  id: string;
  horodatage: string;
  utilisateurId: string | null;
  action: string;
  entiteType: string;
  entiteId: string | null;
  resultat: 'SUCCES' | 'REFUS' | 'ERREUR';
}
