import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:15432/postgres';

const globalForDb = globalThis as unknown as {
  client: postgres.Sql | undefined;
};

// Disable prefetch as it is recommended for connection pooling (Supabase)
export const client = globalForDb.client ?? postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== 'production') globalForDb.client = client;

export const db = drizzle({ client, schema });
