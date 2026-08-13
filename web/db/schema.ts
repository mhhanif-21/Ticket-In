import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

// Ini hanya contoh schema untuk memastikan Drizzle jalan (akan diganti sepenuhnya di S1-T4)
export const exampleTable = pgTable("example", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
