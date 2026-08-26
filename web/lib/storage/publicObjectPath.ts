/**
 * Returns a path only for an object URL produced by this application's
 * configured Supabase project and public bucket. External URLs are never
 * placed on a cleanup queue.
 */
export function getPublicStorageObjectPath(value: string | null, bucket: string): string | null {
  if (!value || !process.env.NEXT_PUBLIC_SUPABASE_URL) return null;
  try {
    const storageBase = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const objectUrl = new URL(value);
    const prefix = `/storage/v1/object/public/${encodeURIComponent(bucket)}/`;
    if (objectUrl.origin !== storageBase.origin || !objectUrl.pathname.startsWith(prefix)) return null;

    const path = objectUrl.pathname.slice(prefix.length);
    if (!path || path.split('/').some((segment) => !segment || segment === '.' || segment === '..')) return null;
    return path.split('/').map((segment) => decodeURIComponent(segment)).join('/');
  } catch {
    return null;
  }
}
