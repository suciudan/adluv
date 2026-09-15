CREATE TABLE `saved_ads` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`ad_id` varchar(191) NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `saved_ads_id` PRIMARY KEY(`id`),
	CONSTRAINT `saved_ads_user_ad_unique` UNIQUE(`user_id`,`ad_id`)
);
