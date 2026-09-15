ALTER TABLE `notification_settings`
ADD `digest_frequency` enum('instant','daily','weekly') NOT NULL DEFAULT 'instant';
--> statement-breakpoint

ALTER TABLE `alert_deliveries`
ADD `read_at` datetime;
