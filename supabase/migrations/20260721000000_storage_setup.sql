-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('event_posters', 'event_posters', true),
  ('participant_files', 'participant_files', false),
  ('qr_tickets', 'qr_tickets', false)
ON CONFLICT (id) DO NOTHING;

-- Public can read event posters
CREATE POLICY "Public Access for Posters" ON storage.objects
  FOR SELECT USING (bucket_id = 'event_posters');

-- To prevent public uploads (SA-002), we DO NOT add any public INSERT policies.
-- Backend (using Service Role Key) will automatically bypass RLS to upload files.
