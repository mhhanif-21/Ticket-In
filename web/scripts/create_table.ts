import postgres from 'postgres';

const sql = postgres('postgresql://postgres:postgres@host.docker.internal:15432/postgres');

async function run() {
  console.log('Creating events table...');
  await sql`
    CREATE TABLE IF NOT EXISTS events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(255) NOT NULL UNIQUE,
      description TEXT,
      location VARCHAR(255) NOT NULL,
      date TIMESTAMP NOT NULL,
      poster_url TEXT,
      capacity INTEGER NOT NULL,
      registration_mode VARCHAR(50) NOT NULL,
      volunteer_pin_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `;
  console.log('Table created.');
  process.exit(0);
}

run().catch(console.error);
