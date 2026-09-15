CREATE TABLE `advertiser_search_aliases` (
	`id` varchar(191) NOT NULL,
	`advertiser_id` varchar(191) NOT NULL,
	`query` varchar(255) NOT NULL,
	`normalized_query` varchar(255) NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `advertiser_search_aliases_id` PRIMARY KEY(`id`),
	CONSTRAINT `advertiser_search_aliases_query_advertiser_unique` UNIQUE(`normalized_query`,`advertiser_id`)
);
