-- Migration 0003 : la liste des espaces d'un utilisateur indique aussi le nom
-- de l'association, pour l'écran « choisir mon espace » de l'interface.

DROP FUNCTION IF EXISTS app_espaces_utilisateur(uuid);

CREATE FUNCTION app_espaces_utilisateur(p_utilisateur uuid)
  RETURNS TABLE (
    tenant_id uuid,
    association_nom text,
    organisation_id uuid,
    organisation_nom text,
    role text
  )
  LANGUAGE sql STABLE SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT a.tenant_id, racine.nom, a.organisation_id, o.nom, a.role::text
  FROM adhesion a
  JOIN organisation o ON o.id = a.organisation_id
  JOIN organisation racine ON racine.id = a.tenant_id
  WHERE a.utilisateur_id = p_utilisateur
  ORDER BY racine.nom, o.nom
$$;

REVOKE ALL ON FUNCTION app_espaces_utilisateur(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_espaces_utilisateur(uuid) TO snl_app;
