-- Per-event WhatsApp group invitation link used by Manual Review emails and
-- the post-OTP status page. Nullable because not every event has a group.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS whatsapp_group_url text;
