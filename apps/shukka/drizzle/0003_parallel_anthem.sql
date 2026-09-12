PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`app_id` integer NOT NULL,
	`channel_id` integer NOT NULL,
	`version` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`released_at` integer,
	`metadata_hits` integer DEFAULT 0 NOT NULL,
	`artifact_hits` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`channel_id`) REFERENCES `channels`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_versions`("id", "app_id", "channel_id", "version", "created_at", "released_at", "metadata_hits", "artifact_hits") SELECT "id", "app_id", "channel_id", "version", "released_at", "released_at", "metadata_hits", "artifact_hits" FROM `versions`;--> statement-breakpoint
DROP TABLE `versions`;--> statement-breakpoint
ALTER TABLE `__new_versions` RENAME TO `versions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `versions_channel_version_unique` ON `versions` (`channel_id`,`version`);