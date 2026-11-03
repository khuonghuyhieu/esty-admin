export function up(pgm) {
  pgm.sql(`
    CREATE FUNCTION app_private.has_current_session(session_uuid uuid, user_uuid uuid)
      RETURNS boolean
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = pg_catalog
      AS $$
    BEGIN
      IF pg_catalog.row_security_active('auth.sessions'::pg_catalog.regclass) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'session_reader_unavailable';
      END IF;
      RETURN EXISTS (
        SELECT 1 FROM auth.sessions
        WHERE id = session_uuid AND user_id = user_uuid
          AND (not_after IS NULL OR not_after > pg_catalog.clock_timestamp())
      );
    END; $$;
    REVOKE ALL ON FUNCTION app_private.has_current_session(uuid, uuid) FROM PUBLIC;
    DO $grants$
    BEGIN
      IF to_regrole('app_runtime') IS NOT NULL THEN
        GRANT EXECUTE ON FUNCTION app_private.has_current_session(uuid, uuid) TO app_runtime;
      END IF;
    END; $grants$;
  `);
}

export function down() {
  throw new Error('Session-interface rollback requires a separately reviewed application/schema compatibility procedure.');
}
