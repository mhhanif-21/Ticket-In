import { createClient } from '@supabase/supabase-js';
import { STORAGE_BUCKETS } from '../lib/storage/buckets';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

const bucketDefinitions = [
  {
    name: STORAGE_BUCKETS.eventPosters,
    public: true,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
    fileSizeLimit: 5 * 1024 * 1024,
  },
  {
    name: STORAGE_BUCKETS.participantFiles,
    public: false,
    allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
    fileSizeLimit: 1 * 1024 * 1024,
  },
  {
    name: STORAGE_BUCKETS.tickets,
    public: true,
    allowedMimeTypes: ['image/png'],
    fileSizeLimit: 5 * 1024 * 1024,
  },
] as const;

async function setupStorage() {
  const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();

  if (listError) {
    throw new Error(`Error listing buckets: ${listError.message}`);
  }

  for (const definition of bucketDefinitions) {
    if (buckets.some((bucket) => bucket.name === definition.name)) {
      console.log(`Bucket "${definition.name}" already exists.`);
      continue;
    }

    const { error: createError } = await supabaseAdmin.storage.createBucket(definition.name, {
      public: definition.public,
      allowedMimeTypes: [...definition.allowedMimeTypes],
      fileSizeLimit: definition.fileSizeLimit,
    });

    if (createError) {
      throw new Error(`Failed to create bucket "${definition.name}": ${createError.message}`);
    }

    console.log(`Bucket "${definition.name}" created successfully.`);
  }
}

setupStorage().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
