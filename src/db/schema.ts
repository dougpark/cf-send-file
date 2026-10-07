import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ==========================================
// AUTHENTICATION & USERS
// ==========================================

export const users = sqliteTable(
    'users',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        email: text('email').notNull(),
        displayName: text('display_name'),

        // Signing in only proves control of an email; membership is the approval gate for app content.
        isMember: integer('is_member', { mode: 'boolean' }).default(false),

        // Role flags. Owner implies Admin. Editor is an example staff role — rename/add roles for your domain.
        isOwner: integer('is_owner', { mode: 'boolean' }).default(false),
        isAdmin: integer('is_admin', { mode: 'boolean' }).default(false),
        isEditor: integer('is_editor', { mode: 'boolean' }).default(false),

        isSuspended: integer('is_suspended', { mode: 'boolean' }).default(false),
        lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),

        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        uniqueIndex('idx_users_email_unique').on(table.email),
    ]
);

// Alternate sign-in emails (e.g. work + personal) that resolve to the same account.
export const userLoginEmails = sqliteTable(
    'user_login_emails',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        email: text('email').notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        uniqueIndex('idx_user_login_emails_email_unique').on(table.email),
        index('idx_user_login_emails_user').on(table.userId),
    ]
);

// Magic link + 6-digit code (15-min TTL). Both are hashed; consuming either invalidates both.
export const magicTokens = sqliteTable(
    'magic_tokens',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        email: text('email').notNull(),
        token: text('token').notNull(),
        codeHash: text('code_hash'),
        codeAttempts: integer('code_attempts').notNull().default(0),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        uniqueIndex('idx_magic_tokens_token_unique').on(table.token),
        index('idx_magic_tokens_email').on(table.email),
    ]
);

// Long-lived rolling sessions (400 days). id is the SHA-256 of the cookie value.
export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id').primaryKey(),
        userId: integer('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        userAgent: text('user_agent'),
        ipAddress: text('ip_address'),
        lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        index('idx_sessions_user').on(table.userId),
        index('idx_sessions_last_seen').on(table.lastSeenAt, table.userId),
    ]
);

export const accessRequests = sqliteTable(
    'access_requests',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        email: text('email').notNull(),
        fullName: text('full_name').notNull(),
        message: text('message'),
        status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
        reviewedByUserId: integer('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
        reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
        notes: text('notes'),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        index('idx_access_requests_email').on(table.email),
        index('idx_access_requests_status').on(table.status),
    ]
);

export const magicLinkRateLimits = sqliteTable(
    'magic_link_rate_limits',
    {
        email: text('email').primaryKey(),
        minuteStartedAt: integer('minute_started_at', { mode: 'timestamp' }).notNull(),
        dailyStartedAt: integer('daily_started_at', { mode: 'timestamp' }).notNull(),
        dailyCount: integer('daily_count').notNull().default(0),
    }
);

// ==========================================
// AUDIT & SETTINGS
// ==========================================

export const ACTIVITY_LOG_CATEGORIES = ['access_control', 'access_request', 'user_management', 'settings'] as const;

export const activityLogs = sqliteTable(
    'activity_logs',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        actorUserId: integer('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
        targetUserId: integer('target_user_id').references(() => users.id, { onDelete: 'set null' }),
        category: text('category', { enum: ACTIVITY_LOG_CATEGORIES }).notNull(),
        action: text('action').notNull(),
        details: text('details'),
        createdAt: integer('created_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
    },
    (table) => [
        index('idx_activity_logs_category').on(table.category, table.createdAt),
        index('idx_activity_logs_target').on(table.targetUserId),
    ]
);

// Key/value store (JSON values) so new settings don't need a migration. Editable keys are whitelisted server-side.
export const settings = sqliteTable(
    'settings',
    {
        id: integer('id').primaryKey({ autoIncrement: true }),
        key: text('key').notNull(),
        value: text('value', { mode: 'json' }).notNull(),
        updatedAt: integer('updated_at', { mode: 'timestamp' }).$defaultFn(() => new Date()),
        updatedByUserId: integer('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    },
    (table) => [
        uniqueIndex('idx_settings_key_unique').on(table.key),
    ]
);
