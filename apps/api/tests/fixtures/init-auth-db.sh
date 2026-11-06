#!/usr/bin/env bash
set -euo pipefail
[[ "$POSTGRES_USER" == f005_fixture_admin ]]
[[ "$POSTGRES_DB" =~ ^f005_[a-f0-9]{32}$ ]]
[[ "$F005_RUN_NONCE" =~ ^[a-f0-9]{32}$ ]]
[[ "${F005_PROFILE:-006}" == 006 || "${F005_PROFILE:-006}" == activation001 ]]
legacy_roles=true
[[ "${F005_PROFILE:-006}" != activation001 ]] || legacy_roles=false
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=nonce="$F005_RUN_NONCE" --set=legacy_roles="$legacy_roles" <<'SQL'
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE ROLE supabase_auth_admin LOGIN NOINHERIT PASSWORD 'synthetic_f005_auth_only';
\if :legacy_roles
CREATE ROLE app_runtime LOGIN NOINHERIT PASSWORD 'synthetic_f005_runtime_only';
CREATE ROLE app_operator LOGIN NOINHERIT PASSWORD 'synthetic_f005_operator_only';
\endif
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE postgres NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin;
ALTER ROLE supabase_auth_admin SET search_path = auth;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
\if :legacy_roles
GRANT USAGE ON SCHEMA public TO app_runtime, app_operator;
\endif
CREATE TABLE public.f005_fixture_marker (nonce text PRIMARY KEY CHECK (nonce ~ '^[a-f0-9]{32}$'));
INSERT INTO public.f005_fixture_marker VALUES (:'nonce');
REVOKE ALL ON public.f005_fixture_marker FROM PUBLIC;
SQL
