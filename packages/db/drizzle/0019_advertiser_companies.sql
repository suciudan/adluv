CREATE TABLE `advertiser_companies` (
	`id` varchar(191) NOT NULL,
	`normalized_domain` varchar(255) NOT NULL,
	`website_url` varchar(1024),
	`display_name` varchar(255) NOT NULL,
	`logo_url` varchar(1024),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `advertiser_companies_id` PRIMARY KEY(`id`),
	CONSTRAINT `advertiser_companies_normalized_domain_unique` UNIQUE(`normalized_domain`)
);
--> statement-breakpoint
ALTER TABLE `advertisers`
ADD COLUMN `website_url` varchar(1024),
ADD COLUMN `normalized_domain` varchar(255),
ADD COLUMN `company_id` varchar(191);
--> statement-breakpoint
ALTER TABLE `advertisers`
ADD CONSTRAINT `advertisers_company_id_advertiser_companies_id_fk`
FOREIGN KEY (`company_id`) REFERENCES `advertiser_companies`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `advertisers_normalized_domain_idx` ON `advertisers` (`normalized_domain`);
--> statement-breakpoint
CREATE INDEX `advertisers_company_id_idx` ON `advertisers` (`company_id`);
