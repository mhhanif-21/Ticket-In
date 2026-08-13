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
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

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
  checkInSessions: many(checkInSessions),
}));

// 2. Table form_fields
export const formFields = pgTable('form_fields', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventId: uuid('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade' }),
  fieldName: varchar('field_name', { length: 255 }).notNull(),
  fieldType: varchar('field_type', { length: 50 }).notNull(), // text, number, options, file
  isRequired: boolean('is_required').default(false).notNull(),
  options: jsonb('options'), // array of options for type 'options'
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

export const registrationsRelations = relations(registrations, ({ one, many }) => ({
  event: one(events, {
    fields: [registrations.eventId],
    references: [events.id],
  }),
  otps: many(otps),
  checkInLogs: many(checkInLogs),
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
});

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
