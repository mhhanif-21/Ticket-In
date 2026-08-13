-- Canonical Storage contract used by the application runtime.
-- Legacy bucket migrations remain untouched for history compatibility.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('event_posters', 'event_posters', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/jpg']::text[]),
  ('participant_files', 'participant_files', false, 1048576, ARRAY['image/png', 'image/jpeg', 'image/jpg']::text[]),
  ('tickets', 'tickets', true, 5242880, ARRAY['image/png']::text[])
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Public read event_posters'
  ) THEN
    CREATE POLICY "Public read event_posters"
      ON storage.objects
      FOR SELECT
      TO public
      USING (bucket_id = 'event_posters');
  END IF;
END
$$;

-- participant_files and tickets are written by the backend service role.
-- No public INSERT, UPDATE, or DELETE policy is granted here.
