CREATE TABLE `oauthApplication` (
	`id` varchar(191) NOT NULL,
	`name` varchar(255) NOT NULL,
	`icon` varchar(1024),
	`metadata` text,
	`clientId` varchar(191) NOT NULL,
	`clientSecret` varchar(255),
	`redirectUrls` text NOT NULL,
	`type` varchar(64) NOT NULL,
	`authenticationScheme` varchar(64) NOT NULL,
	`disabled` boolean NOT NULL DEFAULT false,
	`userId` varchar(191),
	`createdAt` datetime(3) NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `oauthApplication_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_oauth_application_client_id_unique` UNIQUE(`clientId`),
	CONSTRAINT `oauthApplication_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `auth_oauth_application_user_id_idx` ON `oauthApplication` (`userId`);
--> statement-breakpoint
CREATE TABLE `oauthAccessToken` (
	`id` varchar(191) NOT NULL,
	`accessToken` varchar(191) NOT NULL,
	`refreshToken` varchar(191) NOT NULL,
	`accessTokenExpiresAt` datetime(3) NOT NULL,
	`refreshTokenExpiresAt` datetime(3) NOT NULL,
	`clientId` varchar(191) NOT NULL,
	`userId` varchar(191),
	`scopes` varchar(1024) NOT NULL,
	`createdAt` datetime(3) NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `oauthAccessToken_id` PRIMARY KEY(`id`),
	CONSTRAINT `auth_oauth_access_token_access_token_unique` UNIQUE(`accessToken`),
	CONSTRAINT `auth_oauth_access_token_refresh_token_unique` UNIQUE(`refreshToken`),
	CONSTRAINT `oauthAccessToken_clientId_oauthApplication_clientId_fk` FOREIGN KEY (`clientId`) REFERENCES `oauthApplication`(`clientId`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `oauthAccessToken_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `auth_oauth_access_token_client_id_idx` ON `oauthAccessToken` (`clientId`);
--> statement-breakpoint
CREATE INDEX `auth_oauth_access_token_user_id_idx` ON `oauthAccessToken` (`userId`);
--> statement-breakpoint
CREATE TABLE `oauthConsent` (
	`id` varchar(191) NOT NULL,
	`clientId` varchar(191) NOT NULL,
	`userId` varchar(191) NOT NULL,
	`scopes` varchar(1024) NOT NULL,
	`consentGiven` boolean NOT NULL DEFAULT true,
	`createdAt` datetime(3) NOT NULL,
	`updatedAt` datetime(3) NOT NULL,
	CONSTRAINT `oauthConsent_id` PRIMARY KEY(`id`),
	CONSTRAINT `oauthConsent_clientId_oauthApplication_clientId_fk` FOREIGN KEY (`clientId`) REFERENCES `oauthApplication`(`clientId`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `oauthConsent_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX `auth_oauth_consent_client_id_idx` ON `oauthConsent` (`clientId`);
--> statement-breakpoint
CREATE INDEX `auth_oauth_consent_user_id_idx` ON `oauthConsent` (`userId`);
