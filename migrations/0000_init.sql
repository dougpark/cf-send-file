CREATE TABLE `access_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`message` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by_user_id` integer,
	`reviewed_at` integer,
	`notes` text,
	`created_at` integer,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_access_requests_email` ON `access_requests` (`email`);--> statement-breakpoint
CREATE INDEX `idx_access_requests_status` ON `access_requests` (`status`);--> statement-breakpoint
CREATE TABLE `activity_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer,
	`target_user_id` integer,
	`category` text NOT NULL,
	`action` text NOT NULL,
	`details` text,
	`created_at` integer,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`target_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_activity_logs_category` ON `activity_logs` (`category`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_activity_logs_target` ON `activity_logs` (`target_user_id`);--> statement-breakpoint
CREATE TABLE `magic_link_rate_limits` (
	`email` text PRIMARY KEY NOT NULL,
	`minute_started_at` integer NOT NULL,
	`daily_started_at` integer NOT NULL,
	`daily_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `magic_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`token` text NOT NULL,
	`code_hash` text,
	`code_attempts` integer DEFAULT 0 NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_magic_tokens_token_unique` ON `magic_tokens` (`token`);--> statement-breakpoint
CREATE INDEX `idx_magic_tokens_email` ON `magic_tokens` (`email`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`user_agent` text,
	`ip_address` text,
	`last_seen_at` integer,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_last_seen` ON `sessions` (`last_seen_at`,`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer,
	`updated_by_user_id` integer,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_settings_key_unique` ON `settings` (`key`);--> statement-breakpoint
CREATE TABLE `user_login_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`email` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_login_emails_email_unique` ON `user_login_emails` (`email`);--> statement-breakpoint
CREATE INDEX `idx_user_login_emails_user` ON `user_login_emails` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`is_member` integer DEFAULT false,
	`is_owner` integer DEFAULT false,
	`is_admin` integer DEFAULT false,
	`is_editor` integer DEFAULT false,
	`is_suspended` integer DEFAULT false,
	`last_login_at` integer,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email_unique` ON `users` (`email`);