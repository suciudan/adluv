ALTER TABLE `saved_ads`
ADD COLUMN `note` text;
--> statement-breakpoint

CREATE TABLE `swipe_file_collections` (
  `id` varchar(191) NOT NULL,
  `user_id` varchar(191) NOT NULL,
  `name` varchar(128) NOT NULL,
  `description` text,
  `created_at` datetime NOT NULL,
  `updated_at` datetime NOT NULL,
  CONSTRAINT `swipe_file_collections_id` PRIMARY KEY(`id`),
  CONSTRAINT `swipe_file_collections_user_name_unique` UNIQUE(`user_id`, `name`)
);
--> statement-breakpoint

CREATE TABLE `swipe_file_collection_items` (
  `id` varchar(191) NOT NULL,
  `collection_id` varchar(191) NOT NULL,
  `saved_ad_id` varchar(191) NOT NULL,
  `created_at` datetime NOT NULL,
  CONSTRAINT `swipe_file_collection_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `swipe_file_collection_items_collection_saved_ad_unique` UNIQUE(`collection_id`, `saved_ad_id`)
);
