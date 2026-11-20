-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TypeOrganisation" AS ENUM ('ASSOCIATION', 'ANTENNE', 'GROUPE_LOCAL');

-- CreateEnum
CREATE TYPE "RoleMembre" AS ENUM ('LOCATAIRE', 'DEMANDEUR', 'BENEVOLE', 'COORDINATEUR', 'TRAVAILLEUR_SOCIAL', 'GESTIONNAIRE', 'ADMINISTRATEUR', 'PARTENAIRE');

-- CreateEnum
CREATE TYPE "StatutUtilisateur" AS ENUM ('INVITE', 'ACTIF', 'SUSPENDU');

-- CreateEnum
CREATE TYPE "StatutLogement" AS ENUM ('DISPONIBLE', 'OCCUPE', 'EN_TRAVAUX', 'HORS_PARC');

-- CreateEnum
CREATE TYPE "StatutAnalyse" AS ENUM ('EN_ATTENTE', 'SAIN', 'INFECTE');

-- CreateEnum
CREATE TYPE "ResultatAudit" AS ENUM ('SUCCES', 'REFUS', 'ERREUR');

-- CreateTable
CREATE TABLE "organisation" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "type" "TypeOrganisation" NOT NULL,
    "nom" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "chemin" TEXT NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateur" (
    "id" UUID NOT NULL,
    "sujet_identite" TEXT,
    "email" TEXT NOT NULL,
    "nom_affiche" TEXT NOT NULL,
    "statut" "StatutUtilisateur" NOT NULL DEFAULT 'INVITE',
    "derniere_connexion" TIMESTAMP(3),
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utilisateur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "adhesion" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "role" "RoleMembre" NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adhesion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_module" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "code_module" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activation_module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "immeuble" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "ligne_adresse" TEXT NOT NULL,
    "code_postal" TEXT NOT NULL,
    "commune" TEXT NOT NULL,
    "code_insee" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "identifiant_ban" TEXT,
    "source" TEXT NOT NULL DEFAULT 'saisie',
    "source_ref" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "immeuble_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logement" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "immeuble_id" UUID,
    "reference" TEXT NOT NULL,
    "typologie" TEXT NOT NULL,
    "surface_m2" DECIMAL(7,2),
    "etage" INTEGER,
    "classe_dpe" TEXT,
    "statut" "StatutLogement" NOT NULL DEFAULT 'DISPONIBLE',
    "source" TEXT NOT NULL DEFAULT 'saisie',
    "source_ref" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "logement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menage" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'saisie',
    "source_ref" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,
    "supprime_le" TIMESTAMP(3),

    CONSTRAINT "menage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personne" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "menage_id" UUID,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "date_naissance" DATE,
    "telephone" TEXT,
    "email" TEXT,
    "nom_normalise" TEXT NOT NULL,
    "telephone_normalise" TEXT,
    "source" TEXT NOT NULL DEFAULT 'saisie',
    "source_ref" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,
    "supprime_le" TIMESTAMP(3),

    CONSTRAINT "personne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "donnees_sensibles" (
    "personne_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "contenu" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "etiquette" BYTEA NOT NULL,
    "version_cle" INTEGER NOT NULL DEFAULT 1,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "donnees_sensibles_pkey" PRIMARY KEY ("personne_id")
);

-- CreateTable
CREATE TABLE "document" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "entite_type" TEXT NOT NULL,
    "entite_id" UUID NOT NULL,
    "categorie" TEXT NOT NULL,
    "nom_fichier" TEXT NOT NULL,
    "type_mime" TEXT NOT NULL,
    "taille_octets" INTEGER NOT NULL,
    "empreinte_sha256" TEXT NOT NULL,
    "cle_stockage" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "statut_analyse" "StatutAnalyse" NOT NULL DEFAULT 'EN_ATTENTE',
    "conserver_jusqu_au" TIMESTAMP(3),
    "depose_par" UUID NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "supprime_le" TIMESTAMP(3),

    CONSTRAINT "document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenement_audit" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "horodatage" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utilisateur_id" UUID,
    "action" TEXT NOT NULL,
    "entite_type" TEXT NOT NULL,
    "entite_id" TEXT,
    "organisation_id" UUID,
    "resultat" "ResultatAudit" NOT NULL,
    "adresse_ip" TEXT,
    "details" JSONB,

    CONSTRAINT "evenement_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organisation_tenant_id_chemin_idx" ON "organisation"("tenant_id", "chemin");

-- CreateIndex
CREATE UNIQUE INDEX "organisation_tenant_id_slug_key" ON "organisation"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_sujet_identite_key" ON "utilisateur"("sujet_identite");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateur_email_key" ON "utilisateur"("email");

-- CreateIndex
CREATE INDEX "adhesion_tenant_id_utilisateur_id_idx" ON "adhesion"("tenant_id", "utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "adhesion_utilisateur_id_organisation_id_role_key" ON "adhesion"("utilisateur_id", "organisation_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "activation_module_organisation_id_code_module_key" ON "activation_module"("organisation_id", "code_module");

-- CreateIndex
CREATE INDEX "immeuble_tenant_id_organisation_id_idx" ON "immeuble"("tenant_id", "organisation_id");

-- CreateIndex
CREATE INDEX "logement_tenant_id_organisation_id_idx" ON "logement"("tenant_id", "organisation_id");

-- CreateIndex
CREATE UNIQUE INDEX "logement_tenant_id_reference_key" ON "logement"("tenant_id", "reference");

-- CreateIndex
CREATE INDEX "menage_tenant_id_organisation_id_idx" ON "menage"("tenant_id", "organisation_id");

-- CreateIndex
CREATE INDEX "personne_tenant_id_nom_normalise_idx" ON "personne"("tenant_id", "nom_normalise");

-- CreateIndex
CREATE INDEX "personne_tenant_id_telephone_normalise_idx" ON "personne"("tenant_id", "telephone_normalise");

-- CreateIndex
CREATE UNIQUE INDEX "document_cle_stockage_key" ON "document"("cle_stockage");

-- CreateIndex
CREATE INDEX "document_tenant_id_entite_type_entite_id_idx" ON "document"("tenant_id", "entite_type", "entite_id");

-- CreateIndex
CREATE INDEX "evenement_audit_tenant_id_horodatage_idx" ON "evenement_audit"("tenant_id", "horodatage");

-- CreateIndex
CREATE INDEX "evenement_audit_tenant_id_entite_type_entite_id_idx" ON "evenement_audit"("tenant_id", "entite_type", "entite_id");

-- CreateIndex
CREATE INDEX "evenement_audit_tenant_id_utilisateur_id_idx" ON "evenement_audit"("tenant_id", "utilisateur_id");

-- AddForeignKey
ALTER TABLE "organisation" ADD CONSTRAINT "organisation_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "organisation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adhesion" ADD CONSTRAINT "adhesion_utilisateur_id_fkey" FOREIGN KEY ("utilisateur_id") REFERENCES "utilisateur"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "adhesion" ADD CONSTRAINT "adhesion_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_module" ADD CONSTRAINT "activation_module_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logement" ADD CONSTRAINT "logement_immeuble_id_fkey" FOREIGN KEY ("immeuble_id") REFERENCES "immeuble"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personne" ADD CONSTRAINT "personne_menage_id_fkey" FOREIGN KEY ("menage_id") REFERENCES "menage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donnees_sensibles" ADD CONSTRAINT "donnees_sensibles_personne_id_fkey" FOREIGN KEY ("personne_id") REFERENCES "personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

