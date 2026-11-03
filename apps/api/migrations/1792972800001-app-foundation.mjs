export function up(pgm) {
  pgm.sql(`
    CREATE SCHEMA app_private;
    REVOKE ALL ON SCHEMA app_private FROM PUBLIC;

    CREATE TABLE app_private.profiles (
      user_id uuid PRIMARY KEY,
      display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100 AND display_name = btrim(display_name)),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE app_private.workspaces (
      id uuid PRIMARY KEY,
      singleton boolean NOT NULL DEFAULT true UNIQUE CHECK (singleton),
      bootstrap_request_id uuid NOT NULL UNIQUE,
      bootstrap_fingerprint text NOT NULL CHECK (bootstrap_fingerprint ~ '^[a-f0-9]{64}$'),
      display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100 AND display_name = btrim(display_name)),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE app_private.memberships (
      workspace_id uuid NOT NULL REFERENCES app_private.workspaces(id) ON DELETE RESTRICT,
      user_id uuid NOT NULL REFERENCES app_private.profiles(user_id) ON DELETE RESTRICT,
      role_code text NOT NULL CHECK (role_code IN ('owner', 'member')),
      status text NOT NULL CHECK (status IN ('active', 'disabled')),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      disabled_at timestamptz,
      PRIMARY KEY (workspace_id, user_id),
      CHECK ((status = 'disabled') = (disabled_at IS NOT NULL))
    );
    CREATE INDEX memberships_active_owners ON app_private.memberships(workspace_id)
      WHERE role_code = 'owner' AND status = 'active';

    CREATE FUNCTION app_private.lock_membership_workspace() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog, app_private AS $$
    DECLARE workspace uuid;
    BEGIN
      IF TG_OP = 'UPDATE' AND (NEW.workspace_id <> OLD.workspace_id OR NEW.user_id <> OLD.user_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'immutable_membership_identity';
      END IF;
      IF TG_OP = 'DELETE' THEN workspace := OLD.workspace_id; ELSE workspace := NEW.workspace_id; END IF;
      PERFORM id FROM app_private.workspaces WHERE id = workspace FOR UPDATE;
      IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
    END; $$;
    CREATE TRIGGER membership_workspace_lock BEFORE INSERT OR UPDATE OR DELETE
      ON app_private.memberships FOR EACH ROW EXECUTE FUNCTION app_private.lock_membership_workspace();

    CREATE FUNCTION app_private.require_active_owner() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog, app_private AS $$
    DECLARE workspace uuid;
    BEGIN
      IF TG_TABLE_NAME = 'workspaces' THEN workspace := NEW.id;
      ELSIF TG_OP = 'DELETE' THEN workspace := OLD.workspace_id;
      ELSE workspace := NEW.workspace_id;
      END IF;
      PERFORM id FROM app_private.workspaces WHERE id = workspace FOR UPDATE;
      IF FOUND AND NOT EXISTS (
        SELECT 1 FROM app_private.memberships WHERE workspace_id = workspace AND role_code = 'owner' AND status = 'active'
      ) THEN RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'last_owner'; END IF;
      RETURN NULL;
    END; $$;
    CREATE CONSTRAINT TRIGGER workspace_requires_owner AFTER INSERT OR UPDATE ON app_private.workspaces
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.require_active_owner();
    CREATE CONSTRAINT TRIGGER membership_requires_owner AFTER INSERT OR UPDATE OR DELETE ON app_private.memberships
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION app_private.require_active_owner();

    CREATE TABLE app_private.invitations (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL REFERENCES app_private.workspaces(id) ON DELETE RESTRICT,
      recipient_email text NOT NULL CHECK (char_length(recipient_email) BETWEEN 3 AND 254 AND recipient_email = lower(recipient_email)),
      target_role_code text NOT NULL DEFAULT 'member' CHECK (target_role_code = 'member'),
      inviter_user_id uuid NOT NULL,
      inviter_membership_revision integer NOT NULL CHECK (inviter_membership_revision > 0),
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
      delivery_state text NOT NULL DEFAULT 'pending' CHECK (delivery_state IN ('pending', 'confirmed', 'failed', 'unknown')),
      revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
      idempotency_key uuid NOT NULL,
      request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[a-f0-9]{64}$'),
      created_at timestamptz NOT NULL DEFAULT now(),
      expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
      accepted_at timestamptz,
      accepted_by_user_id uuid REFERENCES app_private.profiles(user_id) ON DELETE RESTRICT,
      revoked_at timestamptz,
      superseded_by_id uuid REFERENCES app_private.invitations(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
      FOREIGN KEY (workspace_id, inviter_user_id) REFERENCES app_private.memberships(workspace_id, user_id) ON DELETE RESTRICT,
      UNIQUE (workspace_id, inviter_user_id, idempotency_key),
      CHECK (expires_at = created_at + interval '7 days'),
      CHECK ((status = 'accepted') = (accepted_at IS NOT NULL AND accepted_by_user_id IS NOT NULL)),
      CHECK ((status = 'revoked') = (revoked_at IS NOT NULL))
    );
    CREATE UNIQUE INDEX invitations_one_pending ON app_private.invitations(workspace_id, recipient_email) WHERE status = 'pending';
    CREATE INDEX invitations_roster ON app_private.invitations(workspace_id, created_at DESC, id DESC);

    CREATE TABLE app_private.audit_events (
      id uuid PRIMARY KEY,
      workspace_id uuid NOT NULL REFERENCES app_private.workspaces(id) ON DELETE RESTRICT,
      actor_user_id uuid NOT NULL REFERENCES app_private.profiles(user_id) ON DELETE RESTRICT,
      action text NOT NULL CHECK (action IN ('workspace.bootstrap', 'profile.update', 'workspace.update', 'membership.update',
        'invitation.create', 'invitation.revoke', 'invitation.accept', 'invitation.delivery', 'invitation.reconcile')),
      target_id uuid NOT NULL,
      outcome text NOT NULL CHECK (outcome IN ('accepted', 'confirmed', 'failed', 'unknown')),
      request_id uuid NOT NULL,
      before_revision integer,
      after_revision integer,
      before_role text CHECK (before_role IN ('owner', 'member')),
      after_role text CHECK (after_role IN ('owner', 'member')),
      before_status text CHECK (before_status IN ('active', 'disabled')),
      after_status text CHECK (after_status IN ('active', 'disabled')),
      occurred_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX audit_workspace_page ON app_private.audit_events(workspace_id, occurred_at DESC, id DESC);
    REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app_private FROM PUBLIC;

    -- Roles are provisioned separately, before this migration when activating
    -- Auth. A plain foundation-only DB may lack them and receives no app access.
    -- This migration never creates roles or touches the managed Auth schema.
    DO $grants$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname IN ('app_runtime','app_operator')
        AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN
        RAISE EXCEPTION 'unsafe_application_role';
      END IF;
      IF to_regrole('app_runtime') IS NOT NULL THEN
        GRANT USAGE ON SCHEMA app_private TO app_runtime;
        GRANT SELECT ON public.foundation_migrations TO app_runtime;
        GRANT SELECT, INSERT ON app_private.profiles, app_private.memberships, app_private.invitations, app_private.audit_events TO app_runtime;
        GRANT SELECT ON app_private.workspaces TO app_runtime;
        GRANT UPDATE(display_name,revision,updated_at) ON app_private.profiles, app_private.workspaces TO app_runtime;
        GRANT UPDATE(role_code,status,revision,updated_at,disabled_at) ON app_private.memberships TO app_runtime;
        GRANT UPDATE(status,delivery_state,revision,accepted_at,accepted_by_user_id,revoked_at,superseded_by_id) ON app_private.invitations TO app_runtime;
        GRANT EXECUTE ON FUNCTION app_private.lock_membership_workspace(), app_private.require_active_owner() TO app_runtime;
      END IF;
      IF to_regrole('app_operator') IS NOT NULL THEN
        GRANT USAGE ON SCHEMA app_private TO app_operator;
        GRANT SELECT, INSERT ON app_private.profiles, app_private.workspaces, app_private.memberships, app_private.audit_events TO app_operator;
        GRANT UPDATE(display_name) ON app_private.workspaces TO app_operator;
        GRANT SELECT ON app_private.invitations TO app_operator;
        GRANT UPDATE(delivery_state,revision) ON app_private.invitations TO app_operator;
        GRANT EXECUTE ON FUNCTION app_private.lock_membership_workspace(), app_private.require_active_owner() TO app_operator;
      END IF;
    END; $grants$;
  `);
}

export function down() {
  throw new Error('Application data rollback requires a separately reviewed retention/recovery procedure.');
}
