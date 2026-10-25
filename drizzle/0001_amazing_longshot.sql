CREATE TABLE `remediations` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_id` text NOT NULL,
	`violation_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_name` text,
	`source` text NOT NULL,
	`remediation_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`violation_id`) REFERENCES `violations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `remediations_scan_id_idx` ON `remediations` (`scan_id`);--> statement-breakpoint
CREATE INDEX `remediations_violation_id_idx` ON `remediations` (`violation_id`);--> statement-breakpoint
CREATE INDEX `remediations_scan_violation_idx` ON `remediations` (`scan_id`,`violation_id`);