ALTER TABLE events
  ADD COLUMN IF NOT EXISTS creation_key varchar(128);

CREATE UNIQUE INDEX IF NOT EXISTS events_creation_key_unique
  ON events (creation_key);

CREATE TABLE IF NOT EXISTS event_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  storage_path text,
  public_url text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  CONSTRAINT event_media_role_order_check CHECK (
    (role = 'cover' AND display_order = 0)
    OR (role = 'gallery' AND display_order BETWEEN 0 AND 4)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS event_media_event_role_order_unique
  ON event_media (event_id, role, display_order);

CREATE INDEX IF NOT EXISTS event_media_event_order_idx
  ON event_media (event_id, role, display_order);

INSERT INTO event_media (event_id, role, display_order, storage_path, public_url)
SELECT events.id, 'cover', 0, NULL, events.poster_url
FROM events
WHERE events.poster_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM event_media
    WHERE event_media.event_id = events.id
      AND event_media.role = 'cover'
      AND event_media.display_order = 0
  );
