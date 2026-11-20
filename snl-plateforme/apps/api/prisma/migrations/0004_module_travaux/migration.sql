-- CreateEnum
CREATE TYPE "CategorieIntervention" AS ENUM ('PLOMBERIE', 'ELECTRICITE', 'GAZ', 'CHAUFFAGE', 'MENUISERIE', 'SERRURERIE', 'HUMIDITE', 'NUISIBLES', 'ELECTROMENAGER', 'PARTIES_COMMUNES', 'AUTRE');

-- CreateEnum
CREATE TYPE "PrioriteIntervention" AS ENUM ('URGENTE', 'HAUTE', 'NORMALE', 'BASSE');

-- CreateEnum
CREATE TYPE "NatureIntervention" AS ENUM ('DEPANNAGE', 'ENTRETIEN', 'TRAVAUX');

-- CreateEnum
CREATE TYPE "StatutIntervention" AS ENUM ('NOUVEAU', 'QUALIFIE', 'PLANIFIE', 'EN_COURS', 'RESOLU', 'CLOS', 'ANNULE');

-- CreateEnum
CREATE TYPE "TypeLigneCout" AS ENUM ('DEVIS', 'FACTURE');

-- CreateTable
CREATE TABLE "intervention" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "logement_id" UUID NOT NULL,
    "categorie" "CategorieIntervention" NOT NULL,
    "description" TEXT NOT NULL,
    "urgence_signalee" BOOLEAN NOT NULL DEFAULT false,
    "priorite" "PrioriteIntervention",
    "nature" "NatureIntervention",
    "statut" "StatutIntervention" NOT NULL DEFAULT 'NOUVEAU',
    "affecte_utilisateur_id" UUID,
    "affecte_artisan_id" UUID,
    "date_prevue" DATE,
    "signale_par" UUID NOT NULL,
    "entretien_id" UUID,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,
    "resolu_le" TIMESTAMP(3),
    "clos_le" TIMESTAMP(3),

    CONSTRAINT "intervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenement_intervention" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "intervention_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "auteur_id" UUID,
    "details" JSONB,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_intervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_cout" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "intervention_id" UUID NOT NULL,
    "type" "TypeLigneCout" NOT NULL,
    "libelle" TEXT NOT NULL,
    "montant_centimes" INTEGER NOT NULL,
    "saisi_par" UUID NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ligne_cout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artisan" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "raison_sociale" TEXT NOT NULL,
    "siret" TEXT,
    "specialites" "CategorieIntervention"[],
    "telephone" TEXT,
    "email" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artisan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entretien_periodique" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "logement_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "categorie" "CategorieIntervention" NOT NULL,
    "periodicite_mois" INTEGER NOT NULL,
    "prochaine_echeance" DATE NOT NULL,
    "derniere_realisation" DATE,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entretien_periodique_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intervention_tenant_id_organisation_id_statut_idx" ON "intervention"("tenant_id", "organisation_id", "statut");

-- CreateIndex
CREATE INDEX "intervention_tenant_id_logement_id_idx" ON "intervention"("tenant_id", "logement_id");

-- CreateIndex
CREATE INDEX "evenement_intervention_tenant_id_intervention_id_cree_le_idx" ON "evenement_intervention"("tenant_id", "intervention_id", "cree_le");

-- CreateIndex
CREATE INDEX "ligne_cout_tenant_id_intervention_id_idx" ON "ligne_cout"("tenant_id", "intervention_id");

-- CreateIndex
CREATE INDEX "artisan_tenant_id_organisation_id_idx" ON "artisan"("tenant_id", "organisation_id");

-- CreateIndex
CREATE INDEX "entretien_periodique_tenant_id_organisation_id_prochaine_ec_idx" ON "entretien_periodique"("tenant_id", "organisation_id", "prochaine_echeance");

-- AddForeignKey
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_logement_id_fkey" FOREIGN KEY ("logement_id") REFERENCES "logement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_affecte_artisan_id_fkey" FOREIGN KEY ("affecte_artisan_id") REFERENCES "artisan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intervention" ADD CONSTRAINT "intervention_entretien_id_fkey" FOREIGN KEY ("entretien_id") REFERENCES "entretien_periodique"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evenement_intervention" ADD CONSTRAINT "evenement_intervention_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_cout" ADD CONSTRAINT "ligne_cout_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "intervention"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entretien_periodique" ADD CONSTRAINT "entretien_periodique_logement_id_fkey" FOREIGN KEY ("logement_id") REFERENCES "logement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Sécurité du module M1 : même cloisonnement par association que le socle.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'intervention', 'evenement_intervention', 'ligne_cout', 'artisan', 'entretien_periodique'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolation_association ON %I
         USING (tenant_id = app_tenant_courant())
         WITH CHECK (tenant_id = app_tenant_courant())',
      t
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO snl_app', t);
  END LOOP;
END
$$;

-- Le fil d'une intervention est un historique : on n'y efface ni ne réécrit rien.
REVOKE UPDATE, DELETE, TRUNCATE ON evenement_intervention FROM snl_app;

-- Une ligne de coût ne peut pas être négative.
ALTER TABLE ligne_cout ADD CONSTRAINT ligne_cout_montant_positif CHECK (montant_centimes >= 0);

-- La périodicité d'un entretien est comprise entre 1 mois et 10 ans.
ALTER TABLE entretien_periodique
  ADD CONSTRAINT entretien_periodicite_bornee CHECK (periodicite_mois BETWEEN 1 AND 120);
