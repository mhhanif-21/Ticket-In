CREATE TABLE IF NOT EXISTS participant_file_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  request_id uuid NOT NULL,
  registration_id uuid REFERENCES registrations(id) ON DELETE SET NULL,
  bucket varchar(128) NOT NULL,
  storage_path text NOT NULL,
  field_key varchar(128) NOT NULL,
  status varchar(24) NOT NULL DEFAULT 'staged',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  expires_at timestamp NOT NULL,
  next_attempt_at timestamp NOT NULL DEFAULT now(),
  cleanup_lease_expires_at timestamp,
  cleaned_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT participant_file_uploads_status_check CHECK (
    status IN ('staged', 'claimed', 'cleanup_pending', 'cleaning', 'cleaned')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS participant_file_uploads_storage_path_unique
  ON participant_file_uploads (storage_path);
CREATE INDEX IF NOT EXISTS participant_file_uploads_retry_idx
  ON participant_file_uploads (status, next_attempt_at);
CREATE INDEX IF NOT EXISTS participant_file_uploads_expiry_idx
  ON participant_file_uploads (status, expires_at);
CREATE INDEX IF NOT EXISTS participant_file_uploads_registration_idx
  ON participant_file_uploads (registration_id);
