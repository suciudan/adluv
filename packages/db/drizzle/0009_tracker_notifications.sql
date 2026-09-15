CREATE TABLE `tracker_notifications` (
	`id` varchar(191) NOT NULL,
	`job_id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`tracked_company_id` varchar(191) NOT NULL,
	`advertiser_id` varchar(191) NOT NULL,
	`tracker_notification_kind` enum('initial_index_completed','initial_index_failed') NOT NULL,
	`headline` varchar(255) NOT NULL,
	`body` text,
	`target_url` varchar(1024) NOT NULL,
	`metadata` json,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	`read_at` datetime,
	CONSTRAINT `tracker_notifications_id` PRIMARY KEY(`id`),
	CONSTRAINT `tracker_notifications_job_unique` UNIQUE(`job_id`)
);
