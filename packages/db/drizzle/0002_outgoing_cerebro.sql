CREATE TABLE `notification_settings` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`alerts_enabled` boolean NOT NULL DEFAULT true,
	`email_enabled` boolean NOT NULL DEFAULT true,
	`in_app_enabled` boolean NOT NULL DEFAULT true,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `notification_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `notification_settings_user_unique` UNIQUE(`user_id`)
);
