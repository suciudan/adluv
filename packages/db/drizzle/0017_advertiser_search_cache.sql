CREATE TABLE `advertiser_search_queries` (
	`id` varchar(191) NOT NULL,
	`normalized_query` varchar(255) NOT NULL,
	`display_query` varchar(255) NOT NULL,
	`last_requested_at` datetime(3),
	`refreshed_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `advertiser_search_queries_id` PRIMARY KEY(`id`),
	CONSTRAINT `advertiser_search_queries_normalized_query_unique` UNIQUE(`normalized_query`)
);
--> statement-breakpoint
CREATE TABLE `advertiser_search_query_sources` (
	`id` varchar(191) NOT NULL,
	`query_id` varchar(191) NOT NULL,
	`source` enum('linkedin','facebook','google','tiktok') NOT NULL,
	`status` varchar(32) NOT NULL,
	`error_message` text,
	`started_at` datetime(3),
	`finished_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `advertiser_search_query_sources_id` PRIMARY KEY(`id`),
	CONSTRAINT `advertiser_search_query_sources_query_source_unique` UNIQUE(`query_id`,`source`)
);
--> statement-breakpoint
CREATE TABLE `advertiser_search_query_results` (
	`id` varchar(191) NOT NULL,
	`query_id` varchar(191) NOT NULL,
	`advertiser_id` varchar(191) NOT NULL,
	`source` enum('linkedin','facebook','google','tiktok') NOT NULL,
	`source_advertiser_id` varchar(191) NOT NULL,
	`company_key` varchar(255) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`rank_score` int NOT NULL DEFAULT 0,
	`canonical_name` varchar(255) NOT NULL,
	`profile_url` varchar(512),
	`logo_url` varchar(1024),
	`industry` varchar(128),
	`company_size` varchar(128),
	`country` varchar(128),
	`summary` text,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `advertiser_search_query_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `advertiser_search_query_results_query_source_advertiser_unique` UNIQUE(`query_id`,`source`,`source_advertiser_id`)
);
--> statement-breakpoint
CREATE INDEX `advertiser_search_query_results_query_company_idx` ON `advertiser_search_query_results` (`query_id`,`company_key`);
--> statement-breakpoint
CREATE TABLE `advertiser_search_auto_adds` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`query_id` varchar(191) NOT NULL,
	`company_key` varchar(255) NOT NULL,
	`status` varchar(32) NOT NULL,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	`completed_at` datetime(3),
	CONSTRAINT `advertiser_search_auto_adds_id` PRIMARY KEY(`id`),
	CONSTRAINT `advertiser_search_auto_adds_user_query_company_unique` UNIQUE(`user_id`,`query_id`,`company_key`)
);
