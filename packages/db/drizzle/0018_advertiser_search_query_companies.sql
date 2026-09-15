CREATE TABLE `advertiser_search_query_companies` (
	`id` varchar(191) NOT NULL,
	`query_id` varchar(191) NOT NULL,
	`company_key` varchar(255) NOT NULL,
	`display_name` varchar(255) NOT NULL,
	`website_url` varchar(1024),
	`domain` varchar(255),
	`logo_url` varchar(1024),
	`description` text,
	`rank_score` int NOT NULL DEFAULT 0,
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `advertiser_search_query_companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `advertiser_search_query_companies_query_company_unique` UNIQUE(`query_id`,`company_key`)
);
--> statement-breakpoint
CREATE INDEX `advertiser_search_query_companies_query_rank_idx` ON `advertiser_search_query_companies` (`query_id`,`rank_score`);
