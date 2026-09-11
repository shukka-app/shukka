CREATE TABLE `release_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_id` integer NOT NULL,
	`locale` text NOT NULL,
	`markdown` text NOT NULL,
	`html` text NOT NULL,
	`text` text NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_notes_version_locale_unique` ON `release_notes` (`version_id`,`locale`);--> statement-breakpoint
ALTER TABLE `apps` ADD `release_log_enabled` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `apps` ADD `release_log_locales` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `apps` ADD `release_log_fallback_locale` text DEFAULT 'en-US' NOT NULL;