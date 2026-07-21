import { db } from '../db';
import { sql } from 'drizzle-orm';

async function runMigration() {
  console.log('Creating form_fields table if it does not exist...');
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "form_fields" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "event_id" uuid NOT NULL REFERENCES "events"("id") ON DELETE CASCADE,
        "field_name" varchar(255) NOT NULL,
        "field_type" varchar(50) NOT NULL,
        "is_required" boolean DEFAULT false NOT NULL,
        "options" jsonb,
        "order" integer DEFAULT 0 NOT NULL
      );
    `);
    console.log('✅ form_fields table created/verified successfully.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  }
  process.exit(0);
}

runMigration();
