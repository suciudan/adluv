CREATE TABLE `mcp_api_keys` (
	`id` varchar(191) NOT NULL,
	`user_id` varchar(191) NOT NULL,
	`name` varchar(160) NOT NULL,
	`key_prefix` varchar(32) NOT NULL,
	`key_hash` varchar(64) NOT NULL,
	`last_used_at` datetime(3),
	`created_at` datetime(3) NOT NULL,
	`updated_at` datetime(3) NOT NULL,
	CONSTRAINT `mcp_api_keys_id` PRIMARY KEY(`id`),
	CONSTRAINT `mcp_api_keys_user_name_unique` UNIQUE(`user_id`,`name`),
	CONSTRAINT `mcp_api_keys_key_hash_unique` UNIQUE(`key_hash`)
);
