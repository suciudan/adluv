ALTER TABLE `session` ADD `activeOrganizationId` varchar(191);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`slug` varchar(191) NOT NULL,
	`logo` varchar(1024),
	`metadata` text,
	`owner_user_id` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL,
	`updatedAt` datetime(3),
	CONSTRAINT `organization_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_organization_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `organization_owner_user_id_user_id_fk` FOREIGN KEY (`owner_user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `auth_organization_owner_user_id_idx` ON `organization` (`owner_user_id`);
--> statement-breakpoint
CREATE TABLE `member` (
	`id` varchar(191) NOT NULL,
	`organizationId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`role` varchar(64) NOT NULL DEFAULT 'member',
	`createdAt` datetime(3) NOT NULL,
	CONSTRAINT `member_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_member_organization_user_unique` UNIQUE(`organizationId`,`userId`),
	CONSTRAINT `member_organizationId_organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `member_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `auth_member_user_id_idx` ON `member` (`userId`);
--> statement-breakpoint
CREATE TABLE `invitation` (
	`id` varchar(191) NOT NULL,
	`organizationId` varchar(191) NOT NULL,
	`email` varchar(255) NOT NULL,
	`role` varchar(64) NOT NULL,
	`status` varchar(64) NOT NULL DEFAULT 'pending',
	`expiresAt` datetime(3),
	`inviterId` varchar(191) NOT NULL,
	`createdAt` datetime(3) NOT NULL,
	CONSTRAINT `invitation_id` PRIMARY KEY(`id`),
	CONSTRAINT `invitation_organizationId_organization_id_fk` FOREIGN KEY (`organizationId`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `invitation_inviterId_user_id_fk` FOREIGN KEY (`inviterId`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `auth_invitation_organization_email_idx` ON `invitation` (`organizationId`,`email`);
--> statement-breakpoint
CREATE INDEX `auth_invitation_inviter_id_idx` ON `invitation` (`inviterId`);
--> statement-breakpoint
INSERT IGNORE INTO `organization` (`id`, `name`, `slug`, `logo`, `metadata`, `owner_user_id`, `createdAt`, `updatedAt`)
SELECT
	CONCAT('default_', LEFT(SHA2(`user`.`id`, 256), 48)),
	COALESCE(NULLIF(`user`.`name`, ''), NULLIF(`user`.`username`, ''), `user`.`email`),
	LOWER(CONCAT(REPLACE(REPLACE(COALESCE(NULLIF(`user`.`username`, ''), SUBSTRING_INDEX(`user`.`email`, '@', 1), `user`.`id`), ' ', '-'), '.', '-'), '-', LEFT(SHA2(`user`.`id`, 256), 8))),
	NULL,
	NULL,
	`user`.`id`,
	NOW(3),
	NOW(3)
FROM `user`
WHERE NOT EXISTS (
	SELECT 1 FROM `member` WHERE `member`.`userId` = `user`.`id`
);
--> statement-breakpoint
INSERT IGNORE INTO `member` (`id`, `organizationId`, `userId`, `role`, `createdAt`)
SELECT
	CONCAT('member_', LEFT(SHA2(`user`.`id`, 256), 48)),
	CONCAT('default_', LEFT(SHA2(`user`.`id`, 256), 48)),
	`user`.`id`,
	'owner',
	NOW(3)
FROM `user`
WHERE EXISTS (
	SELECT 1 FROM `organization` WHERE `organization`.`id` = CONCAT('default_', LEFT(SHA2(`user`.`id`, 256), 48))
);
--> statement-breakpoint
ALTER TABLE `advertiser_search_auto_adds` ADD `workspace_id` varchar(191);
--> statement-breakpoint
ALTER TABLE `tracked_companies` ADD `workspace_id` varchar(191);
--> statement-breakpoint
ALTER TABLE `alerts` ADD `workspace_id` varchar(191);
--> statement-breakpoint
ALTER TABLE `tracker_notifications` ADD `workspace_id` varchar(191);
--> statement-breakpoint
ALTER TABLE `saved_ads` ADD `workspace_id` varchar(191);
--> statement-breakpoint
ALTER TABLE `swipe_file_collections` ADD `workspace_id` varchar(191);
--> statement-breakpoint
UPDATE `advertiser_search_auto_adds` SET `workspace_id` = CONCAT('default_', LEFT(SHA2(`user_id`, 256), 48)) WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `tracked_companies` SET `workspace_id` = CONCAT('default_', LEFT(SHA2(`user_id`, 256), 48)) WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `alerts` SET `workspace_id` = CONCAT('default_', LEFT(SHA2(`user_id`, 256), 48)) WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `tracker_notifications` SET `workspace_id` = CONCAT('default_', LEFT(SHA2(`user_id`, 256), 48)) WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `saved_ads` SET `workspace_id` = CONCAT('default_', LEFT(SHA2(`user_id`, 256), 48)) WHERE `workspace_id` IS NULL;
--> statement-breakpoint
UPDATE `swipe_file_collections` SET `workspace_id` = CONCAT('default_', LEFT(SHA2(`user_id`, 256), 48)) WHERE `workspace_id` IS NULL;
--> statement-breakpoint
ALTER TABLE `advertiser_search_auto_adds` ADD CONSTRAINT `advertiser_search_auto_adds_workspace_id_organization_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `tracked_companies` ADD CONSTRAINT `tracked_companies_workspace_id_organization_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `alerts` ADD CONSTRAINT `alerts_workspace_id_organization_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `tracker_notifications` ADD CONSTRAINT `tracker_notifications_workspace_id_organization_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `saved_ads` ADD CONSTRAINT `saved_ads_workspace_id_organization_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `swipe_file_collections` ADD CONSTRAINT `swipe_file_collections_workspace_id_organization_id_fk` FOREIGN KEY (`workspace_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP INDEX `advertiser_search_auto_adds_user_query_company_unique` ON `advertiser_search_auto_adds`;
--> statement-breakpoint
DROP INDEX `tracked_companies_user_advertiser_unique` ON `tracked_companies`;
--> statement-breakpoint
DROP INDEX `saved_ads_user_ad_unique` ON `saved_ads`;
--> statement-breakpoint
DROP INDEX `swipe_file_collections_user_name_unique` ON `swipe_file_collections`;
--> statement-breakpoint
CREATE UNIQUE INDEX `advertiser_search_auto_adds_workspace_query_company_unique` ON `advertiser_search_auto_adds` (`workspace_id`,`query_id`,`company_key`);
--> statement-breakpoint
CREATE INDEX `advertiser_search_auto_adds_workspace_idx` ON `advertiser_search_auto_adds` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_companies_workspace_advertiser_unique` ON `tracked_companies` (`workspace_id`,`advertiser_id`);
--> statement-breakpoint
CREATE INDEX `tracked_companies_workspace_idx` ON `tracked_companies` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `alerts_workspace_idx` ON `alerts` (`workspace_id`);
--> statement-breakpoint
CREATE INDEX `tracker_notifications_workspace_idx` ON `tracker_notifications` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `saved_ads_workspace_ad_unique` ON `saved_ads` (`workspace_id`,`ad_id`);
--> statement-breakpoint
CREATE INDEX `saved_ads_workspace_idx` ON `saved_ads` (`workspace_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `swipe_file_collections_workspace_name_unique` ON `swipe_file_collections` (`workspace_id`,`name`);
--> statement-breakpoint
CREATE INDEX `swipe_file_collections_workspace_idx` ON `swipe_file_collections` (`workspace_id`);
