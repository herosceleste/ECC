-- CreateEnum
CREATE TYPE "TypeActivite" AS ENUM ('VISITE', 'CHANTIER', 'PERMANENCE', 'REUNION', 'FORMATION', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutInscription" AS ENUM ('INSCRIT', 'LISTE_ATTENTE', 'DESISTE');

-- CreateTable
CREATE TABLE "profil_benevole" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "telephone" TEXT,
    "telephone_masque" BOOLEAN NOT NULL DEFAULT false,
    "competences" TEXT[],
    "centres_interet" TEXT[],
    "date_arrivee" DATE,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profil_benevole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disponibilite" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "jour_semaine" INTEGER,
    "date" DATE,
    "heure_debut" TEXT NOT NULL,
    "heure_fin" TEXT NOT NULL,
    "commentaire" TEXT,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disponibilite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activite" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "type" "TypeActivite" NOT NULL,
    "titre" TEXT NOT NULL,
    "description" TEXT,
    "lieu" TEXT,
    "debut" TIMESTAMP(3) NOT NULL,
    "fin" TIMESTAMP(3) NOT NULL,
    "places" INTEGER,
    "intervention_id" UUID,
    "cree_par" UUID NOT NULL,
    "annulee_le" TIMESTAMP(3),
    "rappel_envoye_le" TIMESTAMP(3),
    "alerte_sans_inscrit_le" TIMESTAMP(3),
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscription" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "activite_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "statut" "StatutInscription" NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referent" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menage_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profil_benevole_tenant_id_utilisateur_id_key" ON "profil_benevole"("tenant_id", "utilisateur_id");

-- CreateIndex
CREATE INDEX "disponibilite_tenant_id_utilisateur_id_idx" ON "disponibilite"("tenant_id", "utilisateur_id");

-- CreateIndex
CREATE INDEX "activite_tenant_id_organisation_id_debut_idx" ON "activite"("tenant_id", "organisation_id", "debut");

-- CreateIndex
CREATE INDEX "inscription_tenant_id_utilisateur_id_idx" ON "inscription"("tenant_id", "utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "inscription_activite_id_utilisateur_id_key" ON "inscription"("activite_id", "utilisateur_id");

-- CreateIndex
CREATE INDEX "referent_tenant_id_utilisateur_id_idx" ON "referent"("tenant_id", "utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "referent_menage_id_utilisateur_id_key" ON "referent"("menage_id", "utilisateur_id");

-- AddForeignKey
ALTER TABLE "inscription" ADD CONSTRAINT "inscription_activite_id_fkey" FOREIGN KEY ("activite_id") REFERENCES "activite"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Sécurité du module M2 : cloisonnement par association.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profil_benevole', 'disponibilite', 'activite', 'inscription', 'referent']
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

ALTER TABLE activite ADD CONSTRAINT activite_dates_coherentes CHECK (fin > debut);
ALTER TABLE activite ADD CONSTRAINT activite_places_positives CHECK (places IS NULL OR places > 0);
ALTER TABLE disponibilite ADD CONSTRAINT disponibilite_jour_ou_date
  CHECK ((jour_semaine IS NULL) <> (date IS NULL));
ALTER TABLE disponibilite ADD CONSTRAINT disponibilite_jour_valide
  CHECK (jour_semaine IS NULL OR jour_semaine BETWEEN 1 AND 7);

-- Liste des associations, pour les tâches planifiées (rappels, alertes) qui
-- parcourent chaque association l'une après l'autre. Ne renvoie que des
-- identifiants.
CREATE OR REPLACE FUNCTION app_associations()
  RETURNS TABLE (tenant_id uuid)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT id FROM organisation WHERE type = 'ASSOCIATION' ORDER BY id
$$;

REVOKE ALL ON FUNCTION app_associations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_associations() TO snl_app;
