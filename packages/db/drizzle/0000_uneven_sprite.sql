CREATE TABLE `accounts` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`provider_id` varchar(128) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ad_observations` (
	`id` varchar(191) NOT NULL,
	`ad_id` varchar(191) NOT NULL,
	`observed_at` datetime NOT NULL,
	`countries` json,
	`impression_window` varchar(128),
	`raw_payload` json,
	CONSTRAINT `ad_observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `ads` (
	`id` varchar(191) NOT NULL,
	`advertiser_id` varchar(191) NOT NULL,
	`source` enum('linkedin','facebook','tiktok') NOT NULL,
	`source_ad_id` varchar(191),
	`fingerprint` varchar(191) NOT NULL,
	`title` varchar(255),
	`body` text,
	`call_to_action` varchar(128),
	`destination_url` varchar(1024),
	`media_url` varchar(1024),
	`format` varchar(64),
	`payer` varchar(255),
	`first_seen_at` datetime NOT NULL,
	`last_seen_at` datetime NOT NULL,
	`metadata` json,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `ads_id` PRIMARY KEY(`id`),
	CONSTRAINT `ads_source_identity_unique` UNIQUE(`source`,`source_ad_id`,`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `advertisers` (
	`id` varchar(191) NOT NULL,
	`source` enum('linkedin','facebook','tiktok') NOT NULL,
	`source_advertiser_id` varchar(191) NOT NULL,
	`canonical_name` varchar(255) NOT NULL,
	`profile_url` varchar(512),
	`last_indexed_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `advertisers_id` PRIMARY KEY(`id`),
	CONSTRAINT `advertisers_source_external_unique` UNIQUE(`source`,`source_advertiser_id`)
);
--> statement-breakpoint
CREATE TABLE `alert_deliveries` (
	`id` varchar(191) NOT NULL,
	`alert_id` varchar(191) NOT NULL,
	`alert_channel` enum('email','in_app') NOT NULL,
	`delivered_at` datetime,
	`failed_at` datetime,
	`error_message` text,
	CONSTRAINT `alert_deliveries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`tracked_company_id` varchar(191) NOT NULL,
	`ad_id` varchar(191) NOT NULL,
	`headline` varchar(255) NOT NULL,
	`body` text,
	`created_at` datetime NOT NULL,
	CONSTRAINT `alerts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `entitlements` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`tracked_company_limit` int NOT NULL,
	`alerts_enabled` boolean NOT NULL DEFAULT true,
	`sync_enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `entitlements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` varchar(191) NOT NULL,
	`queue_name` varchar(128) NOT NULL,
	`payload` json,
	`job_status` enum('queued','running','completed','failed') NOT NULL DEFAULT 'queued',
	`attempts` int NOT NULL DEFAULT 0,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	`started_at` datetime,
	`finished_at` datetime,
	CONSTRAINT `jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `landing_page_snapshots` (
	`id` varchar(191) NOT NULL,
	`ad_id` varchar(191) NOT NULL,
	`url` varchar(1024) NOT NULL,
	`title` varchar(255),
	`html` text,
	`screenshot_url` varchar(1024),
	`captured_at` datetime NOT NULL,
	CONSTRAINT `landing_page_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`expires_at` datetime NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`stripe_customer_id` varchar(191),
	`stripe_subscription_id` varchar(191),
	`plan` varchar(64) NOT NULL,
	`status` varchar(64) NOT NULL,
	`current_period_end` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tracked_companies` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`advertiser_id` varchar(191) NOT NULL,
	`tracker_status` enum('pending_initial_index','active','retryable_error','paused') NOT NULL DEFAULT 'pending_initial_index',
	`last_synced_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `tracked_companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `tracked_companies_user_advertiser_unique` UNIQUE(`user_id`,`advertiser_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(191) NOT NULL,
	`email` varchar(255) NOT NULL,
	`name` varchar(255),
	`image` varchar(512),
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `users_id` PRIMARY KEY(`id`)
);
