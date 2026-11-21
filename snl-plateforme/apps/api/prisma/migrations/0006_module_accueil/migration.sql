-- CreateEnum
CREATE TYPE "TypeContenuAccueil" AS ENUM ('ETAPE', 'FICHE', 'FAQ', 'CONTACT', 'ENGAGEMENT_CHARTE', 'ENGAGEMENT_CONFIDENTIALITE');

-- CreateTable
CREATE TABLE "contenu_accueil" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "type" "TypeContenuAccueil" NOT NULL,
    "titre" TEXT NOT NULL,
    "corps" TEXT NOT NULL,
    "lien_video" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "publie" BOOLEAN NOT NULL DEFAULT true,
    "cree_par" UUID NOT NULL,
    "cree_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modifie_le" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contenu_accueil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progression_accueil" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "contenu_id" UUID NOT NULL,
    "terminee_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progression_accueil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engagement_signe" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "utilisateur_id" UUID NOT NULL,
    "type" "TypeContenuAccueil" NOT NULL,
    "empreinte" TEXT NOT NULL,
    "signe_le" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_signe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parrainage" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "filleul_id" UUID NOT NULL,
    "parrain_id" UUID NOT NULL,
    "debut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "relance_envoyee_le" TIMESTAMP(3),
    "cree_par" UUID NOT NULL,

    CONSTRAINT "parrainage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_etape" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parrainage_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "fait_le" TIMESTAMP(3),

    CONSTRAINT "point_etape_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contenu_accueil_tenant_id_organisation_id_type_idx" ON "contenu_accueil"("tenant_id", "organisation_id", "type");

-- CreateIndex
CREATE INDEX "progression_accueil_tenant_id_utilisateur_id_idx" ON "progression_accueil"("tenant_id", "utilisateur_id");

-- CreateIndex
CREATE UNIQUE INDEX "progression_accueil_utilisateur_id_contenu_id_key" ON "progression_accueil"("utilisateur_id", "contenu_id");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_signe_tenant_id_utilisateur_id_type_empreinte_key" ON "engagement_signe"("tenant_id", "utilisateur_id", "type", "empreinte");

-- CreateIndex
CREATE UNIQUE INDEX "parrainage_tenant_id_filleul_id_key" ON "parrainage"("tenant_id", "filleul_id");

-- CreateIndex
CREATE INDEX "point_etape_tenant_id_parrainage_id_idx" ON "point_etape"("tenant_id", "parrainage_id");

-- AddForeignKey
ALTER TABLE "progression_accueil" ADD CONSTRAINT "progression_accueil_contenu_id_fkey" FOREIGN KEY ("contenu_id") REFERENCES "contenu_accueil"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_etape" ADD CONSTRAINT "point_etape_parrainage_id_fkey" FOREIGN KEY ("parrainage_id") REFERENCES "parrainage"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Sécurité du module M3 : cloisonnement par association.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['contenu_accueil', 'progression_accueil', 'engagement_signe', 'parrainage', 'point_etape']
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

-- Une signature est une preuve : elle ne se modifie ni ne s'efface.
REVOKE UPDATE, DELETE, TRUNCATE ON engagement_signe FROM snl_app;

-- Recherche plein texte en français dans la foire aux questions (M3-F05).
CREATE INDEX contenu_accueil_recherche
  ON contenu_accueil USING gin (to_tsvector('french', titre || ' ' || corps));

ALTER TABLE contenu_accueil
  ADD CONSTRAINT contenu_lien_video_https CHECK (lien_video IS NULL OR lien_video LIKE 'https://%');
ALTER TABLE parrainage ADD CONSTRAINT parrainage_distinct CHECK (filleul_id <> parrain_id);
