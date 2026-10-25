CREATE TABLE `affected_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`violation_id` text NOT NULL,
	`scan_id` text NOT NULL,
	`target_selectors` text NOT NULL,
	`html_snippet` text NOT NULL,
	`failure_summary` text NOT NULL,
	`related_nodes` text,
	FOREIGN KEY (`violation_id`) REFERENCES `violations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `affected_nodes_violation_id_idx` ON `affected_nodes` (`violation_id`);--> statement-breakpoint
CREATE INDEX `affected_nodes_scan_id_idx` ON `affected_nodes` (`scan_id`);--> statement-breakpoint
CREATE TABLE `scan_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_id` text NOT NULL,
	`automated_score` integer DEFAULT 0 NOT NULL,
	`total_rules` integer DEFAULT 0 NOT NULL,
	`total_affected_elements` integer DEFAULT 0 NOT NULL,
	`critical_rules` integer DEFAULT 0 NOT NULL,
	`serious_rules` integer DEFAULT 0 NOT NULL,
	`moderate_rules` integer DEFAULT 0 NOT NULL,
	`minor_rules` integer DEFAULT 0 NOT NULL,
	`unknown_rules` integer DEFAULT 0 NOT NULL,
	`passed_rules` integer DEFAULT 0 NOT NULL,
	`incomplete_checks` integer DEFAULT 0 NOT NULL,
	`inapplicable_rules` integer DEFAULT 0 NOT NULL,
	`timing_navigation_ms` integer,
	`timing_audit_ms` integer,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_metrics_scan_id_unique` ON `scan_metrics` (`scan_id`);--> statement-breakpoint
CREATE INDEX `scan_metrics_scan_id_idx` ON `scan_metrics` (`scan_id`);--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`submitted_url` text NOT NULL,
	`normalized_url` text NOT NULL,
	`final_url` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress_stage` text DEFAULT 'queued' NOT NULL,
	`status_message` text DEFAULT 'Scan job queued.' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`duration_ms` integer,
	`error_code` text,
	`error_message` text,
	`error_details` text,
	`scanner_metadata` text,
	`warnings` text,
	`has_truncated_data` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scans_status_idx` ON `scans` (`status`);--> statement-breakpoint
CREATE INDEX `scans_created_at_idx` ON `scans` (`created_at`);--> statement-breakpoint
CREATE INDEX `scans_normalized_url_idx` ON `scans` (`normalized_url`);--> statement-breakpoint
CREATE TABLE `violations` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_id` text NOT NULL,
	`rule_id` text NOT NULL,
	`impact` text DEFAULT 'unknown' NOT NULL,
	`description` text NOT NULL,
	`help_text` text NOT NULL,
	`help_url` text NOT NULL,
	`tags` text NOT NULL,
	`wcag_tags` text NOT NULL,
	`affected_count` integer DEFAULT 0 NOT NULL,
	`metadata` text,
	FOREIGN KEY (`scan_id`) REFERENCES `scans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `violations_scan_id_idx` ON `violations` (`scan_id`);--> statement-breakpoint
CREATE INDEX `violations_rule_id_idx` ON `violations` (`rule_id`);--> statement-breakpoint
CREATE INDEX `violations_impact_idx` ON `violations` (`impact`);