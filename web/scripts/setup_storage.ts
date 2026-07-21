import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

async function setupStorage() {
  console.log('Checking posters bucket...');
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  
  if (error) {
    console.error('Error listing buckets:', error);
    process.exit(1);
  }

  const posterBucketExists = buckets.some(b => b.name === 'posters');
  
  if (!posterBucketExists) {
    console.log('Bucket "posters" not found. Creating...');
    const { error: createError } = await supabaseAdmin.storage.createBucket('posters', {
      public: true, // Make it public so anyone can view the poster
      allowedMimeTypes: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
      fileSizeLimit: 5242880, // 5MB
    });

    if (createError) {
      console.error('Failed to create bucket:', createError);
      process.exit(1);
    }
    console.log('Bucket "posters" created successfully.');
  } else {
    console.log('Bucket "posters" already exists.');
  }
}

setupStorage().catch(console.error);
