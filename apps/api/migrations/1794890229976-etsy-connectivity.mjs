export function up(pgm) {
  pgm.sql(`
    CREATE TABLE app_private.etsy_connections (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL UNIQUE REFERENCES app_private.workspaces(id),
      app_ref text NOT NULL, intended_shop_id bigint NOT NULL CHECK (intended_shop_id > 0),
      etsy_user_id bigint CHECK (etsy_user_id > 0), shop_id bigint CHECK (shop_id > 0),
      state text NOT NULL CHECK (state IN ('unconnected','verification_pending','active','reconnect_required','refresh_unknown','disconnected')),
      link_epoch integer NOT NULL DEFAULT 0 CHECK (link_epoch >= 0), revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
      next_version integer NOT NULL DEFAULT 1 CHECK (next_version > 0), active_version integer,
      verified_at timestamptz, last_read_at timestamptz, last_outcome text,
      UNIQUE(workspace_id,id), UNIQUE(app_ref,shop_id),
      CHECK ((etsy_user_id IS NULL) = (shop_id IS NULL)), CHECK (shop_id IS NULL OR shop_id = intended_shop_id)
    );
    CREATE TABLE app_private.etsy_connection_invitations (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL, connection_id uuid NOT NULL,
      creator_user_id uuid NOT NULL, creator_revision integer NOT NULL,
      app_ref text NOT NULL, config_fingerprint text NOT NULL, expected_shop_id bigint NOT NULL CHECK (expected_shop_id > 0),
      expected_user_id bigint, purpose text NOT NULL CHECK (purpose IN ('connect','reconnect')),
      epoch integer NOT NULL, token_hash text UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
      state text NOT NULL CHECK (state IN ('pending','in_progress','connected','declined','expired','cancelled','failed','outcome_unknown')),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
      claimed_at timestamptz, attempt_id uuid,
      FOREIGN KEY(workspace_id,connection_id) REFERENCES app_private.etsy_connections(workspace_id,id),
      FOREIGN KEY(workspace_id,creator_user_id) REFERENCES app_private.memberships(workspace_id,user_id),
      UNIQUE(workspace_id,id), CHECK (expires_at > created_at)
    );
    CREATE UNIQUE INDEX etsy_one_outstanding_invitation ON app_private.etsy_connection_invitations(workspace_id)
      WHERE state IN ('pending','in_progress');
    CREATE TABLE app_private.etsy_authorization_attempts (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL, connection_id uuid NOT NULL, invitation_id uuid NOT NULL,
      state_hash text UNIQUE CHECK (state_hash ~ '^[a-f0-9]{64}$'), verifier jsonb,
      state text NOT NULL CHECK (state IN ('pending','exchanging','verification_pending','completed','denied','expired','failed','exchange_unknown','cancelled')),
      epoch integer NOT NULL, candidate_version integer, submission_id uuid UNIQUE,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), expires_at timestamptz NOT NULL,
      submitted_at timestamptz, deadline timestamptz,
      FOREIGN KEY(workspace_id,connection_id) REFERENCES app_private.etsy_connections(workspace_id,id),
      FOREIGN KEY(workspace_id,invitation_id) REFERENCES app_private.etsy_connection_invitations(workspace_id,id),
      CHECK (expires_at = created_at + interval '300 seconds')
    );
    CREATE UNIQUE INDEX etsy_one_outstanding_attempt ON app_private.etsy_authorization_attempts(workspace_id)
      WHERE state IN ('pending','exchanging','verification_pending');
    CREATE TABLE app_private.etsy_credentials (
      workspace_id uuid NOT NULL, connection_id uuid NOT NULL, version integer NOT NULL CHECK (version > 0),
      state text NOT NULL CHECK (state IN ('candidate','active')), envelope jsonb NOT NULL,
      expires_at timestamptz NOT NULL, refresh_expires_at timestamptz NOT NULL,
      PRIMARY KEY(workspace_id,connection_id,version),
      FOREIGN KEY(workspace_id,connection_id) REFERENCES app_private.etsy_connections(workspace_id,id)
    );
    CREATE TABLE app_private.etsy_refresh_attempts (
      id uuid PRIMARY KEY, workspace_id uuid NOT NULL, connection_id uuid NOT NULL,
      epoch integer NOT NULL, credential_version integer NOT NULL, result_version integer,
      state text NOT NULL CHECK (state IN ('reserved','submitted','committed','rejected','unknown')),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), deadline timestamptz NOT NULL,
      FOREIGN KEY(workspace_id,connection_id) REFERENCES app_private.etsy_connections(workspace_id,id),
      UNIQUE(workspace_id,connection_id,credential_version)
    );
    CREATE TABLE app_private.etsy_operation_receipts (
      workspace_id uuid NOT NULL REFERENCES app_private.workspaces(id), actor_user_id uuid NOT NULL,
      id uuid NOT NULL, kind text NOT NULL, fingerprint text NOT NULL, result jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(workspace_id,actor_user_id,id)
    );
    CREATE TABLE app_private.etsy_cooldowns (
      app_ref text PRIMARY KEY, retry_not_before timestamptz NOT NULL
    );
    ALTER TABLE app_private.audit_events DROP CONSTRAINT audit_events_action_check;
    ALTER TABLE app_private.audit_events ADD CONSTRAINT audit_events_action_check CHECK (action IN (
      'workspace.bootstrap','profile.update','workspace.update','membership.update','invitation.create','invitation.revoke',
      'invitation.accept','invitation.delivery','invitation.reconcile','etsy.invitation.create','etsy.invitation.cancel',
      'etsy.attempt.start','etsy.callback','etsy.sync','etsy.refresh','etsy.disconnect','etsy.prune'));
    REVOKE ALL ON app_private.etsy_connections, app_private.etsy_connection_invitations,
      app_private.etsy_authorization_attempts, app_private.etsy_credentials, app_private.etsy_refresh_attempts,
      app_private.etsy_operation_receipts, app_private.etsy_cooldowns FROM PUBLIC;
    DO $grants$ BEGIN
      IF to_regrole('app_runtime') IS NOT NULL THEN
        GRANT SELECT,INSERT,UPDATE ON app_private.etsy_connections, app_private.etsy_connection_invitations,
          app_private.etsy_authorization_attempts, app_private.etsy_credentials, app_private.etsy_refresh_attempts,
          app_private.etsy_operation_receipts, app_private.etsy_cooldowns TO app_runtime;
        GRANT DELETE ON app_private.etsy_credentials TO app_runtime;
      END IF;
    END; $grants$;
    CREATE FUNCTION app_private.prune_etsy(workspace uuid, actor uuid, receipt uuid, retention_seconds integer, batch_size integer)
      RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, app_private AS $$
    DECLARE removed integer;
    BEGIN
      IF retention_seconds NOT BETWEEN 300 AND 2592000 OR batch_size NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION 'invalid_prune_policy';
      END IF;
      PERFORM id FROM app_private.workspaces WHERE id = workspace FOR UPDATE;
      IF NOT EXISTS (SELECT 1 FROM app_private.memberships WHERE workspace_id = workspace AND user_id = actor
        AND role_code = 'owner' AND status = 'active') THEN RAISE EXCEPTION 'forbidden'; END IF;
      UPDATE app_private.etsy_connection_invitations SET state='expired',token_hash=NULL
        WHERE workspace_id=workspace AND id IN (
          SELECT i.id FROM app_private.etsy_connection_invitations i
          WHERE i.workspace_id=workspace AND i.state IN ('pending','in_progress')
            AND (i.expires_at<=clock_timestamp() OR EXISTS (
              SELECT 1 FROM app_private.etsy_authorization_attempts a WHERE a.invitation_id=i.id
                AND a.workspace_id=workspace AND a.expires_at<=clock_timestamp()))
          ORDER BY i.id LIMIT batch_size);
      UPDATE app_private.etsy_authorization_attempts SET state='expired',verifier=NULL,state_hash=NULL
        WHERE workspace_id=workspace AND state IN ('pending','exchanging','verification_pending') AND invitation_id IN (
          SELECT id FROM app_private.etsy_connection_invitations WHERE workspace_id=workspace AND state='expired'
          ORDER BY id LIMIT batch_size);
      DELETE FROM app_private.etsy_credentials WHERE workspace_id=workspace AND state='candidate' AND version IN (
        SELECT candidate_version FROM app_private.etsy_authorization_attempts WHERE workspace_id=workspace AND state='expired'
        ORDER BY id LIMIT batch_size);
      WITH targets AS (
        SELECT id FROM app_private.etsy_connection_invitations WHERE workspace_id = workspace
        AND state NOT IN ('pending','in_progress') AND expires_at < clock_timestamp() - make_interval(secs => retention_seconds)
        ORDER BY id LIMIT batch_size
      ), erased AS (
        DELETE FROM app_private.etsy_authorization_attempts WHERE workspace_id = workspace
        AND invitation_id IN (SELECT id FROM targets) RETURNING invitation_id
      )
      DELETE FROM app_private.etsy_connection_invitations WHERE workspace_id = workspace
        AND id IN (SELECT id FROM targets) AND (SELECT count(*) FROM erased) >= 0;
      GET DIAGNOSTICS removed = ROW_COUNT;
      DELETE FROM app_private.etsy_operation_receipts WHERE workspace_id=workspace AND (actor_user_id,id) IN (
        SELECT actor_user_id,id FROM app_private.etsy_operation_receipts WHERE workspace_id=workspace
          AND created_at<clock_timestamp()-make_interval(secs=>retention_seconds) ORDER BY created_at,id LIMIT batch_size);
      DELETE FROM app_private.etsy_refresh_attempts WHERE workspace_id=workspace AND id IN (
        SELECT r.id FROM app_private.etsy_refresh_attempts r JOIN app_private.etsy_connections c
          ON c.workspace_id=r.workspace_id AND c.id=r.connection_id
        WHERE r.workspace_id=workspace AND r.created_at<clock_timestamp()-make_interval(secs=>retention_seconds)
          AND r.credential_version IS DISTINCT FROM c.active_version
        ORDER BY r.created_at,r.id LIMIT batch_size);
      INSERT INTO app_private.audit_events(id,workspace_id,actor_user_id,action,target_id,outcome,request_id)
        VALUES(receipt,workspace,actor,'etsy.prune',workspace,'accepted',receipt);
      RETURN removed;
    END; $$;
    REVOKE ALL ON FUNCTION app_private.prune_etsy(uuid,uuid,uuid,integer,integer) FROM PUBLIC;
    -- Membership lookup is not authenticated actor approval. Operational prune is
    -- deferred; only the migration owner retains access until an approved flow exists.
    DO $grants$ BEGIN
      IF to_regrole('app_operator') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION app_private.prune_etsy(uuid,uuid,uuid,integer,integer) FROM app_operator;
      END IF;
      IF to_regrole('app_runtime') IS NOT NULL THEN
        REVOKE ALL ON FUNCTION app_private.prune_etsy(uuid,uuid,uuid,integer,integer) FROM app_runtime;
      END IF;
    END; $grants$;
  `);
}

export function down() {
  throw new Error('Etsy credential and binding retention requires a separately approved recovery procedure.');
}
