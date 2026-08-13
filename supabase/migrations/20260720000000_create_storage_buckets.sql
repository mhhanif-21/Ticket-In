-- Create buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('event-posters', 'event-posters', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('participant-files', 'participant-files', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('ticket-qrs', 'ticket-qrs', false);



-- Allow public to read event-posters
CREATE POLICY "Public Access for event-posters" ON storage.objects
FOR SELECT USING (bucket_id = 'event-posters');

-- Allow backend (service_role) to do everything (though service_role bypasses RLS anyway)
CREATE POLICY "Service Role Access" ON storage.objects
FOR ALL USING (auth.role() = 'service_role');
