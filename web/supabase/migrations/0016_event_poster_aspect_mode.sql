-- One persisted aspect ratio contract for the event poster collection.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS poster_aspect_mode varchar(16);

UPDATE public.events
SET poster_aspect_mode = 'landscape'
WHERE poster_aspect_mode IS NULL
   OR poster_aspect_mode NOT IN ('portrait', 'landscape', 'banner');

ALTER TABLE public.events
  ALTER COLUMN poster_aspect_mode SET DEFAULT 'landscape',
  ALTER COLUMN poster_aspect_mode SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_poster_aspect_mode_check'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_poster_aspect_mode_check
      CHECK (poster_aspect_mode IN ('portrait', 'landscape', 'banner'));
  END IF;
END $$;
