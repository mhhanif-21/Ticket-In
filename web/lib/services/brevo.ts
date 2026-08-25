/**
 * Brevo Transactional Email Service
 * EHR-002: Strict hard-timeout of 3 seconds.
 */

const DEFAULT_BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

export interface EmailPayload {
  to: { email: string; name?: string }[];
  subject: string;
  htmlContent: string;
  sender?: { email: string; name: string };
  attachment?: { content: string; name: string }[];
}

export function getConfiguredBrevoSender(): { email: string; name: string } {
  const email = process.env.BREVO_SENDER_EMAIL?.trim();
  const name = process.env.BREVO_SENDER_NAME?.trim() || 'Event Gate';

  if (!email) {
    throw new Error('BREVO_SENDER_EMAIL is not defined');
  }

  return { email, name };
}

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const apiUrl = process.env.BREVO_API_URL?.trim() || DEFAULT_BREVO_API_URL;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not defined');
  }

  const requestPayload = payload.sender
    ? payload
    : { ...payload, sender: getConfiguredBrevoSender() };

  const controller = new AbortController();
  // Hard timeout 3 seconds
  const timeoutId = setTimeout(() => controller.abort(), 3000);

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(requestPayload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Brevo API error: ${response.status} ${errorText}`);
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error('Brevo email sending timed out after 3000ms');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
