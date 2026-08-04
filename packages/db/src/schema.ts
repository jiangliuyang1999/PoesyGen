import type { ProsodyReport, WorkLine } from '@poesygen/domain';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const generationSessions = pgTable(
  'generation_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    patternId: text('pattern_id').notNull(),
    theme: text('theme').notNull(),
    preferredRhymeGroup: text('preferred_rhyme_group'),
    status: text('status').notNull().default('queued'),
    maxRounds: integer('max_rounds').notNull().default(8),
    currentRound: integer('current_round').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('generation_sessions_status_idx').on(table.status)],
);

export const workVersions = pgTable(
  'work_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => generationSessions.id, { onDelete: 'cascade' }),
    parentVersionId: uuid('parent_version_id'),
    version: integer('version').notNull(),
    title: text('title'),
    lines: jsonb('lines').$type<ReadonlyArray<WorkLine>>().notNull(),
    prosodyReport: jsonb('prosody_report').$type<ProsodyReport>(),
    source: text('source').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('work_versions_session_idx').on(table.sessionId),
    index('work_versions_parent_idx').on(table.parentVersionId),
  ],
);

export const modelCalls = pgTable(
  'model_calls',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => generationSessions.id, { onDelete: 'cascade' }),
    operation: text('operation').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    promptVersion: text('prompt_version').notNull(),
    inputTokens: integer('input_tokens').notNull(),
    outputTokens: integer('output_tokens').notNull(),
    durationMs: integer('duration_ms').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('model_calls_session_idx').on(table.sessionId)],
);
