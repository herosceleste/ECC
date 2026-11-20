#!/usr/bin/env bash
# Exécuté une seule fois par l'image PostgreSQL officielle, à la création du volume.
# Crée le rôle applicatif « snl_app », non propriétaire des tables, donc soumis
# aux politiques RLS. Le propriétaire est POSTGRES_USER, qui exécute les migrations.
set -euo pipefail

: "${SNL_APP_PASSWORD:?La variable SNL_APP_PASSWORD doit être définie.}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  --set=mdp="$SNL_APP_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE snl_app LOGIN PASSWORD %L', :'mdp')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'snl_app') \gexec
SQL
