CREATE TABLE `admin` (
	`id` int NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` int NOT NULL DEFAULT (unix_timestamp()),
	`updated_at` int NOT NULL DEFAULT (unix_timestamp()),
	CONSTRAINT `admin_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`app_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`hash` varchar(64) NOT NULL,
	`hint` varchar(64) NOT NULL,
	`created_at` int NOT NULL DEFAULT (unix_timestamp()),
	`last_used_at` int,
	`revoked_at` int,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `api_keys_hash_unique` UNIQUE(`hash`)
);
--> statement-breakpoint
CREATE TABLE `apps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`s3_endpoint` text,
	`s3_region` varchar(255) NOT NULL,
	`s3_bucket` varchar(255) NOT NULL,
	`s3_prefix` varchar(255) NOT NULL DEFAULT '',
	`s3_access_key_id` varchar(255) NOT NULL,
	`s3_secret_encrypted` text NOT NULL,
	`s3_force_path_style` boolean NOT NULL DEFAULT false,
	`release_log_enabled` boolean NOT NULL DEFAULT false,
	`release_log_locales` text NOT NULL DEFAULT ('[]'),
	`release_log_fallback_locale` varchar(32) NOT NULL DEFAULT 'en-US',
	`updater_kind` varchar(16) NOT NULL DEFAULT 'electron',
	`created_at` int NOT NULL DEFAULT (unix_timestamp()),
	CONSTRAINT `apps_id` PRIMARY KEY(`id`),
	CONSTRAINT `apps_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version_id` int NOT NULL,
	`filename` varchar(255) NOT NULL,
	`s3_key` varchar(1024) NOT NULL,
	`size` int NOT NULL,
	`kind` varchar(16) NOT NULL,
	CONSTRAINT `artifacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `channels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`app_id` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`current_version_id` int,
	`created_at` int NOT NULL DEFAULT (unix_timestamp()),
	CONSTRAINT `channels_id` PRIMARY KEY(`id`),
	CONSTRAINT `channels_app_name_unique` UNIQUE(`app_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `hit_buckets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version_id` int NOT NULL,
	`kind` varchar(16) NOT NULL,
	`hour_start` int NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `hit_buckets_id` PRIMARY KEY(`id`),
	CONSTRAINT `hit_buckets_version_kind_hour_unique` UNIQUE(`version_id`,`kind`,`hour_start`)
);
--> statement-breakpoint
CREATE TABLE `pending_uploads` (
	`id` varchar(255) NOT NULL,
	`app_id` int NOT NULL,
	`channel_id` int NOT NULL,
	`version` varchar(255) NOT NULL,
	`files` text NOT NULL,
	`created_at` int NOT NULL DEFAULT (unix_timestamp()),
	`expires_at` int NOT NULL,
	CONSTRAINT `pending_uploads_id` PRIMARY KEY(`id`),
	CONSTRAINT `pending_uploads_channel_version_unique` UNIQUE(`channel_id`,`version`)
);
--> statement-breakpoint
CREATE TABLE `release_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`version_id` int NOT NULL,
	`locale` varchar(32) NOT NULL,
	`markdown` mediumtext NOT NULL,
	`html` mediumtext NOT NULL,
	`text` mediumtext NOT NULL,
	CONSTRAINT `release_notes_id` PRIMARY KEY(`id`),
	CONSTRAINT `release_notes_version_locale_unique` UNIQUE(`version_id`,`locale`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` varchar(255) NOT NULL,
	`created_at` int NOT NULL DEFAULT (unix_timestamp()),
	`expires_at` int NOT NULL,
	CONSTRAINT `sessions_token_hash` PRIMARY KEY(`token_hash`)
);
--> statement-breakpoint
CREATE TABLE `versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`app_id` int NOT NULL,
	`channel_id` int NOT NULL,
	`version` varchar(255) NOT NULL,
	`created_at` int NOT NULL DEFAULT (unix_timestamp()),
	`released_at` int,
	`metadata` json NOT NULL DEFAULT ('{}'),
	`metadata_hits` int NOT NULL DEFAULT 0,
	`artifact_hits` int NOT NULL DEFAULT 0,
	CONSTRAINT `versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `versions_channel_version_unique` UNIQUE(`channel_id`,`version`)
);
--> statement-breakpoint
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_app_id_apps_id_fk` FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `artifacts` ADD CONSTRAINT `artifacts_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `channels` ADD CONSTRAINT `channels_app_id_apps_id_fk` FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `hit_buckets` ADD CONSTRAINT `hit_buckets_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pending_uploads` ADD CONSTRAINT `pending_uploads_app_id_apps_id_fk` FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pending_uploads` ADD CONSTRAINT `pending_uploads_channel_id_channels_id_fk` FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `release_notes` ADD CONSTRAINT `release_notes_version_id_versions_id_fk` FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_app_id_apps_id_fk` FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `versions` ADD CONSTRAINT `versions_channel_id_channels_id_fk` FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `api_keys_app_idx` ON `api_keys` (`app_id`);--> statement-breakpoint
CREATE INDEX `artifacts_version_idx` ON `artifacts` (`version_id`);--> statement-breakpoint
CREATE INDEX `artifacts_filename_idx` ON `artifacts` (`filename`);