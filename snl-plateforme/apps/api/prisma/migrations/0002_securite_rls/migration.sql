-- Migration 0002 : cloisonnement par association (RLS) et droits du rôle applicatif.
--
-- Deux rôles PostgreSQL :
--   * le propriétaire des tables (celui qui exécute les migrations) ;
--   * « snl_app », utilisé par l'API, qui n'est pas propriétaire et reste donc
--     soumis aux politiques RLS.
-- L'API ouvre chaque transaction par
--   SELECT set_config('app.tenant_id', '<uuid>', true);
-- Sans ce réglage, les politiques ne laissent rien passer.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'snl_app') THEN
    RAISE EXCEPTION 'Le rôle snl_app doit exister avant les migrations (voir infra/postgres/01-roles.sh).';
  END IF;
END
$$;

-- Association courante de la transaction, ou NULL si elle n'est pas définie.
CREATE OR REPLACE FUNCTION app_tenant_courant() RETURNS uuid
  LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'organisation', 'adhesion', 'activation_module', 'immeuble', 'logement',
    'menage', 'personne', 'donnees_sensibles', 'document', 'evenement_audit'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY isolation_association ON %I
         USING (tenant_id = app_tenant_courant())
         WITH CHECK (tenant_id = app_tenant_courant())',
      t
    );
  END LOOP;
END
$$;

-- Droits du rôle applicatif.
GRANT USAGE ON SCHEMA public TO snl_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO snl_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO snl_app;
GRANT EXECUTE ON FUNCTION app_tenant_courant() TO snl_app;

-- Journal d'audit : ajout et lecture seulement (exigence T-05).
REVOKE UPDATE, DELETE, TRUNCATE ON evenement_audit FROM snl_app;

-- La table interne de Prisma n'a pas à être lisible par l'application.
REVOKE ALL ON TABLE _prisma_migrations FROM snl_app;

-- Liste des associations et rôles d'un utilisateur, avant que l'association
-- de la requête soit connue (écran « choisir mon espace »). La fonction
-- s'exécute avec les droits du propriétaire et ne renvoie que les lignes de
-- l'utilisateur demandé.
CREATE OR REPLACE FUNCTION app_espaces_utilisateur(p_utilisateur uuid)
  RETURNS TABLE (tenant_id uuid, organisation_id uuid, organisation_nom text, role text)
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT a.tenant_id, a.organisation_id, o.nom, a.role::text
  FROM adhesion a
  JOIN organisation o ON o.id = a.organisation_id
  WHERE a.utilisateur_id = p_utilisateur
  ORDER BY o.nom
$$;

REVOKE ALL ON FUNCTION app_espaces_utilisateur(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_espaces_utilisateur(uuid) TO snl_app;
