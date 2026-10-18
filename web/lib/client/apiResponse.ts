/**
 * Reads an API response body as JSON without leaking parser failures to users.
 * Proxies and hosting platforms can answer with plain text (for example a 413
 * "Request Entity Too Large" page) before the route handler runs. Callers must
 * treat a null result as an unexpected response instead of showing a
 * JSON.parse error message.
 */
export async function readJsonResponse<T>(response: Response): Promise<T | null> {
  let body: string;
  try {
    body = await response.text();
  } catch {
    return null;
  }

  if (body.trim() === '') return null;

  try {
    const parsed: unknown = JSON.parse(body);
    return parsed === null ? null : parsed as T;
  } catch {
    return null;
  }
}
