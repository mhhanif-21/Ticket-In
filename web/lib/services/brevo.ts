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

export async function sendEmail(payload: EmailPayload): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const apiUrl = process.env.BREVO_API_URL?.trim() || DEFAULT_BREVO_API_URL;
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not defined');
  }

  // Fallback sender if not provided
  if (!payload.sender) {
    payload.sender = { email: 'noreply@eventgate.com', name: 'Event Gate' };
  }

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
      body: JSON.stringify(payload),
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
