-- The Supabase service key is needed only by Storage. Database operations use
-- surmed_app, so even that key does not need Data API access to public app tables.
REVOKE CREATE ON SCHEMA public FROM PUBLIC, surmed_app;
DO $$
DECLARE api_role TEXT; table_name TEXT;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname=api_role) THEN
      EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', api_role);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
      FOREACH table_name IN ARRAY ARRAY[
        'users','patients','appointments','specialties','_DoctorSpecialties',
        'medical_records','medical_attachments','audit_logs','products','stock_movements',
        'invoices','invoice_items','auth_sessions','clinical_access','recovery_tokens','auth_rate_buckets','_prisma_migrations'
      ] LOOP
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, api_role);
      END LOOP;
    END IF;
  END LOOP;
END $$;
