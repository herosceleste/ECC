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

// --- Module M1 Travaux et entretien ---------------------------------------------

export type StatutIntervention = 'NOUVEAU' | 'QUALIFIE' | 'PLANIFIE' | 'EN_COURS' | 'RESOLU' | 'CLOS' | 'ANNULE';

export interface InterventionResume {
  id: string;
  organisationId: string;
  logementId: string;
  categorie: string;
  description: string;
  urgenceSignalee: boolean;
  priorite: 'URGENTE' | 'HAUTE' | 'NORMALE' | 'BASSE' | null;
  nature: 'DEPANNAGE' | 'ENTRETIEN' | 'TRAVAUX' | null;
  statut: StatutIntervention;
  datePrevue: string | null;
  creeLe: string;
  resoluLe: string | null;
  logement?: { id: string; reference: string };
  affecteUtilisateur?: { id: string; nomAffiche: string } | null;
  affecteArtisan?: { id: string; raisonSociale: string; telephone?: string | null } | null;
  totaux?: { devisCentimes: number; facturesCentimes: number };
}

export interface EvenementIntervention {
  id: string;
  type: string;
  auteurNom: string | null;
  details: Record<string, unknown> | null;
  creeLe: string;
}

export interface LigneCout {
  id: string;
  type: 'DEVIS' | 'FACTURE';
  libelle: string;
  montantCentimes: number;
  creeLe: string;
}

export interface InterventionDetail extends InterventionResume {
  signaleParNom: string;
  evenements: EvenementIntervention[];
  couts: LigneCout[];
  totaux: { devisCentimes: number; facturesCentimes: number };
  droits: { gerer: boolean; commenter: boolean; transitions: StatutIntervention[] };
}

export interface Artisan {
  id: string;
  organisationId: string;
  raisonSociale: string;
  siret: string | null;
  specialites: string[];
  telephone: string | null;
  email: string | null;
  actif: boolean;
}

export interface EntretienPeriodique {
  id: string;
  logementId: string;
  libelle: string;
  categorie: string;
  periodiciteMois: number;
  prochaineEcheance: string;
  derniereRealisation: string | null;
  logement?: { id: string; reference: string };
}

export interface Affectables {
  personnes: { id: string; nomAffiche: string; autorisee: boolean }[];
  artisans: { id: string; raisonSociale: string; specialiste: boolean }[];
}

export interface HistoriqueLogement {
  interventions: InterventionResume[];
  entretiens: EntretienPeriodique[];
  coutTotalCentimes: number;
}
