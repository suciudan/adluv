ALTER TABLE `advertisers`
MODIFY COLUMN `source` enum('linkedin','facebook','google','tiktok') NOT NULL;

--> statement-breakpoint

ALTER TABLE `ads`
MODIFY COLUMN `source` enum('linkedin','facebook','google','tiktok') NOT NULL;
