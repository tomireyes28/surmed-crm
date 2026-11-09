-- Surmed tables are accessed by the trusted Nest backend, not Supabase Auth/Data API.
-- The runtime role cannot administer schema/roles or alter/delete audit events.
DO $$
DECLARE table_name TEXT; api_role TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'surmed_app') THEN
    CREATE ROLE surmed_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='surmed_app' AND
    (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit)) THEN
    RAISE EXCEPTION 'surmed_app has unexpected administrative privileges';
  END IF;
  FOREACH table_name IN ARRAY ARRAY[
    'users','patients','appointments','specialties','_DoctorSpecialties',
    'medical_records','medical_attachments','audit_logs','products','stock_movements',
    'invoices','invoice_items','auth_sessions','clinical_access','recovery_tokens','auth_rate_buckets'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
    FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, api_role);
      END IF;
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM surmed_app', table_name);
    IF table_name = 'audit_logs' THEN
      EXECUTE format('GRANT SELECT, INSERT ON TABLE public.%I TO surmed_app', table_name);
    ELSE
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO surmed_app', table_name);
    END IF;
    EXECUTE format('CREATE POLICY surmed_backend_access ON public.%I TO surmed_app USING (true) WITH CHECK (true)', table_name);
  END LOOP;
  ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE public._prisma_migrations FROM PUBLIC, surmed_app;
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public._prisma_migrations FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO surmed_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
