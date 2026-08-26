import { createClient } from '@supabase/supabase-js';
import { STORAGE_BUCKET_DEFINITIONS } from '../lib/storage/buckets';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

function sameMimeTypes(actual: string[] | null | undefined, expected: readonly string[]): boolean {
  return [...(actual ?? [])].sort().join(',') === [...expected].sort().join(',');
}

async function verifyStorageContract() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();

  if (listError) {
    throw new Error(`Error listing buckets: ${listError.message}`);
  }

  for (const definition of STORAGE_BUCKET_DEFINITIONS) {
    const bucket = buckets.find((candidate) => candidate.name === definition.name);
    if (!bucket) {
      throw new Error(`Bucket "${definition.name}" is missing. Apply migration 0013_storage-media-export-durability.sql.`);
    }
    if (
      bucket.public !== definition.public
      || bucket.file_size_limit !== definition.fileSizeLimit
      || !sameMimeTypes(bucket.allowed_mime_types, definition.allowedMimeTypes)
    ) {
      throw new Error(`Bucket "${definition.name}" does not match migration 0013_storage-media-export-durability.sql.`);
    }
    console.log(`Bucket "${definition.name}" matches the migration contract.`);
  }
}

verifyStorageContract().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
