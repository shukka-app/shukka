CREATE TABLE `hit_buckets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version_id` integer NOT NULL,
	`kind` text NOT NULL,
	`hour_start` integer NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`version_id`) REFERENCES `versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hit_buckets_version_kind_hour_unique` ON `hit_buckets` (`version_id`,`kind`,`hour_start`);