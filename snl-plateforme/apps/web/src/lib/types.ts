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

// --- Module M2 Coordination des bénévoles ---------------------------------------

export type StatutInscription = 'INSCRIT' | 'LISTE_ATTENTE' | 'DESISTE';

export interface Activite {
  id: string;
  organisationId: string;
  type: string;
  titre: string;
  description: string | null;
  lieu: string | null;
  debut: string;
  fin: string;
  places: number | null;
  interventionId: string | null;
  annuleeLe: string | null;
  inscrits: number;
  enAttente?: number;
  monStatut: StatutInscription | null;
}

export interface ActiviteDetail extends Activite {
  creeParNom: string;
  inscriptions: { utilisateurId: string; nomAffiche: string; statut: StatutInscription }[];
  droits: { gerer: boolean; participer: boolean };
}

export interface Disponibilite {
  id: string;
  jourSemaine: number | null;
  date: string | null;
  heureDebut: string;
  heureFin: string;
  commentaire: string | null;
}

export interface MembreAnnuaire {
  id: string;
  nomAffiche: string;
  email: string;
  statut: string;
  roles: { role: string; organisation: { id: string; nom: string } }[];
  telephone: string | null;
  competences: string[];
  centresInteret: string[];
  dateArrivee: string | null;
  disponibilites?: Disponibilite[];
}

export interface MonProfil {
  profil: {
    telephone: string | null;
    telephoneMasque: boolean;
    competences: string[];
    centresInteret: string[];
    dateArrivee: string | null;
  };
  disponibilites: Disponibilite[];
}

export interface Referent {
  id: string;
  utilisateurId: string;
  nomAffiche: string;
}

// --- Module M3 Accueil des bénévoles ---------------------------------------------

export type TypeContenuAccueil = 'ETAPE' | 'FICHE' | 'FAQ' | 'CONTACT' | 'ENGAGEMENT_CHARTE' | 'ENGAGEMENT_CONFIDENTIALITE';

export interface ContenuAccueil {
  id: string;
  organisationId: string;
  type: TypeContenuAccueil;
  titre: string;
  corps: string;
  lienVideo: string | null;
  ordre: number;
  publie: boolean;
  portee: string;
  national: boolean;
  modifiable: boolean;
}

export interface PointEtape {
  id: string;
  date: string;
  faitLe: string | null;
}

export interface MonParcours {
  actif: boolean;
  etapes: (ContenuAccueil & { terminee: boolean })[];
  nombreTerminees: number;
  complet: boolean;
  parrain: { nomAffiche: string; email: string; points: PointEtape[] } | null;
  filleuls: {
    parrainageId: string;
    nomAffiche: string;
    email: string | null;
    etapesTerminees: number;
    etapesTotal: number;
    points: PointEtape[];
  }[];
  engagements: { type: string; titre: string; signe: boolean }[];
}

export interface TexteEngagement {
  type: 'ENGAGEMENT_CHARTE' | 'ENGAGEMENT_CONFIDENTIALITE';
  titre: string;
  corps: string;
  empreinte: string;
  parDefaut: boolean;
  signe: boolean;
}

export interface LigneSuivi {
  utilisateurId: string;
  nomAffiche: string;
  organisation: { id: string; nom: string };
  arriveeLe: string;
  etapesTerminees: number;
  etapesTotal: number;
  parrainage: { id: string; parrainNom: string; points: PointEtape[] } | null;
}
