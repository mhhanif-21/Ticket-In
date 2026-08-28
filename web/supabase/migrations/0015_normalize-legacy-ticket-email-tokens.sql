-- Normalize the known pre-0014 approval-template shape. Existing approval
-- rows became ticket templates in 0014, but [CODE] is OTP-only and must not
-- remain in the ticket subject/body.
UPDATE "event_approval_email_templates"
SET
  "subject" = regexp_replace("subject", E'\\[CODE\\]', '', 'gi'),
  "body" = regexp_replace("body", E'\\[CODE\\]', '', 'gi'),
  "updated_at" = now()
WHERE "template_kind" = 'ticket'
  AND ("subject" ~* E'\\[CODE\\]' OR "body" ~* E'\\[CODE\\]');
