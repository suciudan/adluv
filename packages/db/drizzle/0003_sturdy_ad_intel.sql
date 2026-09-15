ALTER TABLE `advertisers`
  ADD `industry` varchar(128),
  ADD `company_size` varchar(128),
  ADD `country` varchar(128),
  ADD `summary` text;
--> statement-breakpoint

ALTER TABLE `ads`
  ADD `status` varchar(64),
  ADD `reaction_count` int NOT NULL DEFAULT 0,
  ADD `comment_count` int NOT NULL DEFAULT 0;
