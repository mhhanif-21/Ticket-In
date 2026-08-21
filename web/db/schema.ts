import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  uniqueIndex,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';

// 1. Table events
export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    description: text('description'),
    location: varchar('location', { length: 255 }).notNull(),
    date: timestamp('date').notNull(),
    posterUrl: text('poster_url'),
    capacity: integer('capacity').notNull(),
    registrationMode: varchar('registration_mode', { length: 50 }).notNull(), // Auto-Accept, Manual Review
    volunteerPinHash: varchar('volunteer_pin_hash', { length: 255 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('events_slug_idx').on(table.slug),
  })
);

export const eventsRelations = relations(events, ({ many }) => ({
  formFields: many(formFields),
  registrations: many(registrations),
  resubmitTokens: many(resubmitTokens),
  checkInSessions: many(checkInSessions),
}));

// 2. Table form_fields
export const formFields = pgTable('form_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  fieldName: varchar('field_name', { length: 255 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).notNull(), // text, number, radio, checkbox, select, file, email, textarea, image
  isRequired: boolean('is_required').default(false).notNull(),
  options: jsonb('options'), // string array for radio, checkbox, and select
  order: integer('order').default(0).notNull(),
});

export const formFieldsRelations = relations(formFields, ({ one }) => ({
  event: one(events, {
    fields: [formFields.eventId],
    references: [events.id],
  }),
}));

// 3. Table registrations
export const registrations = pgTable(
  'registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull(),
    answers: jsonb('answers'), // user's answers to the form fields
    status: varchar('status', { length: 50 }).notNull(), // Draft, Pending, Accepted, Rejected
    ticketCode: varchar('ticket_code', { length: 8 }).unique(),
    qrCodeUrl: text('qr_code_url'),
    presenceStatus: varchar('presence_status', { length: 50 }).default('Absent').notNull(), // Absent, Present
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    eventIdIdx: index('registrations_event_id_idx').on(table.eventId),
    ticketCodeIdx: uniqueIndex('registrations_ticket_code_idx').on(table.ticketCode),
    eventStatusIdx: index('registrations_event_status_idx').on(table.eventId, table.status),
  })
);

// Durable ticket-generation state. A registration can have exactly one job so
// QStash retries and duplicate deliveries remain observable and idempotent.
export const ticketGenerationJobs = pgTable(
  'ticket_generation_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull(), // queued, published, failed, completed
    attempts: integer('attempts').default(0).notNull(),
    qstashMessageId: varchar('qstash_message_id', { length: 255 }),
    lastError: text('last_error'),
    publishedAt: timestamp('published_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    registrationUnique: uniqueIndex('ticket_generation_jobs_registration_id_unique').on(table.registrationId),
    statusIdx: index('ticket_generation_jobs_status_idx').on(table.status),
  })
);

export const registrationsRelations = relations(registrations, ({ one, many }) => ({
  event: one(events, {
    fields: [registrations.eventId],
    references: [events.id],
  }),
  otps: many(otps),
  resubmitTokens: many(resubmitTokens),
  checkInLogs: many(checkInLogs),
  ticketGenerationJobs: many(ticketGenerationJobs),
}));

// One-time ownership proofs for public Draft resubmission. Only a SHA-256
// token hash is persisted; the signed raw token is returned to the participant.
export const resubmitTokens = pgTable(
  'resubmit_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    jti: uuid('jti').notNull(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    normalizedEmail: varchar('normalized_email', { length: 255 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    jtiUnique: uniqueIndex('resubmit_tokens_jti_unique').on(table.jti),
    tokenHashUnique: uniqueIndex('resubmit_tokens_token_hash_unique').on(table.tokenHash),
    registrationActiveIdx: index('resubmit_tokens_registration_active_idx').on(table.registrationId, table.usedAt),
  }),
);

export const resubmitTokensRelations = relations(resubmitTokens, ({ one }) => ({
  registration: one(registrations, {
    fields: [resubmitTokens.registrationId],
    references: [registrations.id],
  }),
  event: one(events, {
    fields: [resubmitTokens.eventId],
    references: [events.id],
  }),
}));

export const ticketGenerationJobsRelations = relations(ticketGenerationJobs, ({ one }) => ({
  registration: one(registrations, {
    fields: [ticketGenerationJobs.registrationId],
    references: [registrations.id],
  }),
}));

// 4. Table otps
export const otps = pgTable('otps', {
  id: uuid('id').primaryKey().defaultRandom(),
  registrationId: uuid('registration_id')
    .notNull()
    .references(() => registrations.id, { onDelete: 'cascade' }),
  otpCode: varchar('otp_code', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  isUsed: boolean('is_used').default(false).notNull(),
});

export const otpsRelations = relations(otps, ({ one }) => ({
  registration: one(registrations, {
    fields: [otps.registrationId],
    references: [registrations.id],
  }),
}));

// 5. Table check_in_sessions
export const checkInSessions = pgTable('check_in_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  volunteerName: varchar('volunteer_name', { length: 255 }).notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
});

export const checkInSessionsRelations = relations(checkInSessions, ({ one, many }) => ({
  event: one(events, {
    fields: [checkInSessions.eventId],
    references: [events.id],
  }),
  checkInLogs: many(checkInLogs),
}));

// 6. Table check_in_logs
export const checkInLogs = pgTable('check_in_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  checkInSessionId: uuid('check_in_session_id')
    .notNull()
    .references(() => checkInSessions.id, { onDelete: 'cascade' }),
  registrationId: uuid('registration_id').references(() => registrations.id, { onDelete: 'set null' }),
  scannedTicketCode: varchar('scanned_ticket_code', { length: 50 }).notNull(),
  scanMethod: varchar('scan_method', { length: 50 }).notNull(), // Camera, Manual
  scanStatus: varchar('scan_status', { length: 50 }).notNull(), // Success, Duplicate, Invalid
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
  scanMethodCheck: check(
    'check_in_logs_scan_method_check',
    sql`${table.scanMethod} IN ('Camera', 'Manual')`,
  ),
  scanStatusCheck: check(
    'check_in_logs_scan_status_check',
    sql`${table.scanStatus} IN ('Success', 'Duplicate', 'Invalid')`,
  ),
}));

export const checkInLogsRelations = relations(checkInLogs, ({ one }) => ({
  checkInSession: one(checkInSessions, {
    fields: [checkInLogs.checkInSessionId],
    references: [checkInSessions.id],
  }),
  registration: one(registrations, {
    fields: [checkInLogs.registrationId],
    references: [registrations.id],
  }),
}));

// 7. Table export_jobs
export const exportJobs = pgTable('export_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 50 }).notNull(), // pending, processing, completed, failed
  fileUrl: text('file_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const exportJobsRelations = relations(exportJobs, ({ one }) => ({
  event: one(events, {
    fields: [exportJobs.eventId],
    references: [events.id],
  }),
}));
