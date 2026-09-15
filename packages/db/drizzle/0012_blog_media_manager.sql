CREATE TABLE IF NOT EXISTS `blog_authors` (
	`id` varchar(191) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`name` varchar(160) NOT NULL,
	`role` varchar(160) NOT NULL,
	`avatar_label` varchar(128) NOT NULL,
	`bio` text NOT NULL,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `blog_authors_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_authors_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `blog_categories` (
	`id` varchar(191) NOT NULL,
	`slug` varchar(160) NOT NULL,
	`name` varchar(160) NOT NULL,
	`description` text,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `blog_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_categories_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `blog_posts` (
	`id` varchar(191) NOT NULL,
	`slug` varchar(200) NOT NULL,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`title` varchar(255) NOT NULL,
	`excerpt` text NOT NULL,
	`body_mdx` text NOT NULL,
	`cover_image_url` varchar(1024),
	`seo_title` varchar(255),
	`seo_description` varchar(320),
	`read_time_minutes` int NOT NULL DEFAULT 1,
	`author_id` varchar(191) NOT NULL,
	`category_id` varchar(191) NOT NULL,
	`published_at` datetime,
	`created_at` datetime NOT NULL,
	`updated_at` datetime NOT NULL,
	CONSTRAINT `blog_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_posts_slug_unique` UNIQUE(`slug`),
	CONSTRAINT `blog_posts_author_id_blog_authors_id_fk` FOREIGN KEY (`author_id`) REFERENCES `blog_authors`(`id`) ON DELETE restrict ON UPDATE no action,
	CONSTRAINT `blog_posts_category_id_blog_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `blog_categories`(`id`) ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
ALTER TABLE `blog_authors`
ADD COLUMN `avatar_image_url` varchar(1024);
