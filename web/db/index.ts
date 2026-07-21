import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:15432/postgres';

// Disable prefetch as it is recommended for connection pooling (Supabase)
export const client = postgres(connectionString, { prepare: false });
export const db = drizzle({ client, schema });
