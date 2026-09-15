ALTER TABLE `notification_settings`
MODIFY `digest_frequency` enum('instant','daily','weekly','monthly') NOT NULL DEFAULT 'daily';
