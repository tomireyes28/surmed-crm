-- Managed Storage schema is configured separately from Prisma migrations.
-- Restrictive policies deny this clinical bucket even if a permissive policy
-- is added later. They do not grant access to other buckets or block service_role.
BEGIN;
DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.buckets'::regclass) THEN
    RAISE EXCEPTION 'Storage RLS must be enabled by the platform';
  END IF;
END $$;
UPDATE storage.buckets SET public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp']
WHERE id = 'medical-records';
DROP POLICY IF EXISTS surmed_deny_client_clinical_objects ON storage.objects;
CREATE POLICY surmed_deny_client_clinical_objects ON storage.objects
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (bucket_id <> 'medical-records') WITH CHECK (bucket_id <> 'medical-records');
DROP POLICY IF EXISTS surmed_deny_client_clinical_bucket ON storage.buckets;
CREATE POLICY surmed_deny_client_clinical_bucket ON storage.buckets
AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (id <> 'medical-records') WITH CHECK (id <> 'medical-records');
COMMIT;
