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
    creationKey: varchar('creation_key', { length: 128 }),
    capacity: integer('capacity').notNull(),
    registrationMode: varchar('registration_mode', { length: 50 }).notNull(), // Auto-Accept, Manual Review
    volunteerPinHash: varchar('volunteer_pin_hash', { length: 255 }).notNull(),
    volunteerSessionVersion: integer('volunteer_session_version').notNull().default(1),
    formVersion: integer('form_version').notNull().default(1),
    status: varchar('status', { length: 20 }).notNull().default('Draft'), // Draft, Published, Cancelled
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    slugIdx: index('events_slug_idx').on(table.slug),
    statusIdx: index('events_status_idx').on(table.status),
    creationKeyUnique: uniqueIndex('events_creation_key_unique').on(table.creationKey),
    statusCheck: check(
      'events_status_check',
      sql`${table.status} IN ('Draft', 'Published', 'Cancelled')`,
    ),
  })
);

export const eventsRelations = relations(events, ({ many }) => ({
  formFields: many(formFields),
  registrations: many(registrations),
  resubmitTokens: many(resubmitTokens),
  checkInSessions: many(checkInSessions),
  media: many(eventMedia),
}));

export const eventMedia = pgTable(
  'event_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull(), // cover, gallery
    displayOrder: integer('display_order').notNull().default(0),
    storagePath: text('storage_path'),
    publicUrl: text('public_url').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    eventRoleOrderUnique: uniqueIndex('event_media_event_role_order_unique').on(
      table.eventId,
      table.role,
      table.displayOrder,
    ),
    eventOrderIdx: index('event_media_event_order_idx').on(
      table.eventId,
      table.role,
      table.displayOrder,
    ),
    roleOrderCheck: check(
      'event_media_role_order_check',
      sql`(${table.role} = 'cover' AND ${table.displayOrder} = 0) OR (${table.role} = 'gallery' AND ${table.displayOrder} BETWEEN 0 AND 4)`,
    ),
  }),
);

export const eventMediaRelations = relations(eventMedia, ({ one }) => ({
  event: one(events, {
    fields: [eventMedia.eventId],
    references: [events.id],
  }),
}));

// Per-event ticket rendering configuration. The background itself lives in
// Storage; coordinates are persisted as normalized JSON so one configuration
// works for any source image resolution.
export const eventTicketTemplates = pgTable(
  'event_ticket_templates',
  {
    eventId: uuid('event_id')
      .primaryKey()
      .references(() => events.id, { onDelete: 'cascade' }),
    mode: varchar('mode', { length: 16 }).notNull().default('default'),
    backgroundPath: text('background_path'),
    elements: jsonb('elements').notNull().default([]),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    modeCheck: check(
      'event_ticket_templates_mode_check',
      sql`${table.mode} IN ('default', 'custom')`,
    ),
  }),
);

export const eventTicketTemplatesRelations = relations(eventTicketTemplates, ({ one }) => ({
  event: one(events, {
    fields: [eventTicketTemplates.eventId],
    references: [events.id],
  }),
}));

// Plain-text template used only for Manual Review approval email. OTP keeps
// the system template and never reads this table.
export const eventApprovalEmailTemplates = pgTable(
  'event_approval_email_templates',
  {
    eventId: uuid('event_id')
      .primaryKey()
      .references(() => events.id, { onDelete: 'cascade' }),
    isActive: boolean('is_active').notNull().default(false),
    subject: text('subject').notNull().default(''),
    body: text('body').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
);

export const eventApprovalEmailTemplatesRelations = relations(eventApprovalEmailTemplates, ({ one }) => ({
  event: one(events, {
    fields: [eventApprovalEmailTemplates.eventId],
    references: [events.id],
  }),
}));

// 2. Table form_fields
export const formFields = pgTable('form_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  fieldName: varchar('field_name', { length: 255 }).notNull(),
  fieldKey: varchar('field_key', { length: 128 }).notNull().default(sql`'field_' || gen_random_uuid()::text`),
  fieldKind: varchar('field_kind', { length: 32 }).notNull().default('custom'), // custom, static_name, static_email
  fieldType: varchar('field_type', { length: 50 }).notNull(), // text, number, radio, checkbox, select, file, email, textarea, image
  isRequired: boolean('is_required').default(false).notNull(),
  options: jsonb('options'), // string array for radio, checkbox, and select
  order: integer('order').default(0).notNull(),
}, (table) => ({
  eventFieldKeyUnique: uniqueIndex('form_fields_event_field_key_unique').on(table.eventId, table.fieldKey),
  kindCheck: check(
    'form_fields_kind_check',
    sql`${table.fieldKind} IN ('custom', 'static_name', 'static_email')`,
  ),
}));

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
    answerFieldLabels: jsonb('answer_field_labels'), // immutable label snapshot keyed by public field key
    formVersion: integer('form_version').notNull().default(1),
    status: varchar('status', { length: 50 }).notNull(), // Draft, Pending, Accepted, Rejected, Expired
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

// Durable ownership and cleanup ledger for objects written before the
// registration transaction commits. Only `claimed` rows belong to a saved
// registration; all other states can be reconciled safely.
export const participantFileUploads = pgTable(
  'participant_file_uploads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id').notNull(),
    registrationId: uuid('registration_id').references(() => registrations.id, { onDelete: 'set null' }),
    bucket: varchar('bucket', { length: 128 }).notNull(),
    storagePath: text('storage_path').notNull(),
    fieldKey: varchar('field_key', { length: 128 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('staged'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    expiresAt: timestamp('expires_at').notNull(),
    nextAttemptAt: timestamp('next_attempt_at').notNull().defaultNow(),
    cleanupLeaseExpiresAt: timestamp('cleanup_lease_expires_at'),
    cleanedAt: timestamp('cleaned_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    storagePathUnique: uniqueIndex('participant_file_uploads_storage_path_unique').on(table.storagePath),
    retryIdx: index('participant_file_uploads_retry_idx').on(table.status, table.nextAttemptAt),
    expiryIdx: index('participant_file_uploads_expiry_idx').on(table.status, table.expiresAt),
    registrationIdx: index('participant_file_uploads_registration_idx').on(table.registrationId),
    statusCheck: check(
      'participant_file_uploads_status_check',
      sql`${table.status} IN ('staged', 'claimed', 'cleanup_pending', 'cleaning', 'cleaned')`,
    ),
  }),
);

// Durable, storage-agnostic cleanup ledger. It intentionally has no event
// foreign key: cleanup must remain retryable after the owning event is gone.
export const storageCleanupJobs = pgTable(
  'storage_cleanup_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bucket: varchar('bucket', { length: 128 }).notNull(),
    storagePath: text('storage_path').notNull(),
    reason: varchar('reason', { length: 64 }).notNull(),
    status: varchar('status', { length: 24 }).notNull().default('held'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    expiresAt: timestamp('expires_at').notNull(),
    nextAttemptAt: timestamp('next_attempt_at').notNull().defaultNow(),
    cleanupLeaseExpiresAt: timestamp('cleanup_lease_expires_at'),
    cleanedAt: timestamp('cleaned_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => ({
    bucketPathUnique: uniqueIndex('storage_cleanup_jobs_bucket_path_unique').on(table.bucket, table.storagePath),
    retryIdx: index('storage_cleanup_jobs_retry_idx').on(table.status, table.nextAttemptAt),
    expiryIdx: index('storage_cleanup_jobs_expiry_idx').on(table.status, table.expiresAt),
    statusCheck: check(
      'storage_cleanup_jobs_status_check',
      sql`${table.status} IN ('held', 'cleanup_pending', 'cleaning', 'cleaned')`,
    ),
  }),
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
    status: varchar('status', { length: 20 }).notNull(), // queued, published, failed, completed, cancelled
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
  statusCapabilities: many(registrationStatusCapabilities),
  checkInLogs: many(checkInLogs),
  ticketGenerationJobs: many(ticketGenerationJobs),
  participantFileUploads: many(participantFileUploads),
}));

export const participantFileUploadsRelations = relations(participantFileUploads, ({ one }) => ({
  registration: one(registrations, {
    fields: [participantFileUploads.registrationId],
    references: [registrations.id],
  }),
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
  sessionVersion: integer('session_version').notNull().default(1),
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
  status: varchar('status', { length: 50 }).notNull(), // pending, publishing, published, processing, completed, failed
  fileUrl: text('file_url'),
  storagePath: text('storage_path'),
  attempts: integer('attempts').default(0).notNull(),
  qstashMessageId: varchar('qstash_message_id', { length: 255 }),
  lastError: text('last_error'),
  publishedAt: timestamp('published_at'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
  statusIdx: index('export_jobs_status_idx').on(table.status),
  statusCheck: check(
    'export_jobs_status_check',
    sql`${table.status} IN ('pending', 'publishing', 'published', 'processing', 'completed', 'failed')`,
  ),
}));

// Short-lived, opaque holder proofs for the public registration status page.
// The browser receives the raw random value once; the database stores only a
// hash, scope, expiry, and revocation marker.
export const registrationStatusCapabilities = pgTable(
  'registration_status_capabilities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => registrations.id, { onDelete: 'cascade' }),
    scope: varchar('scope', { length: 64 }).notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    tokenHashUnique: uniqueIndex('registration_status_capabilities_token_hash_unique').on(table.tokenHash),
    activeLookupIdx: index('registration_status_capabilities_active_lookup_idx').on(
      table.tokenHash,
      table.scope,
      table.expiresAt,
      table.revokedAt,
    ),
    registrationActiveIdx: index('registration_status_capabilities_registration_active_idx').on(
      table.registrationId,
      table.revokedAt,
    ),
    scopeCheck: check(
      'registration_status_capabilities_scope_check',
      sql`${table.scope} = 'registration-status'`,
    ),
  }),
);

export const registrationStatusCapabilitiesRelations = relations(
  registrationStatusCapabilities,
  ({ one }) => ({
    registration: one(registrations, {
      fields: [registrationStatusCapabilities.registrationId],
      references: [registrations.id],
    }),
  }),
);

export const exportJobsRelations = relations(exportJobs, ({ one }) => ({
  event: one(events, {
    fields: [exportJobs.eventId],
    references: [events.id],
  }),
}));
