# Security policy

AdLuv stores credentials, sessions, OAuth tokens, account data, and collected advertising content. Authentication, account isolation, media retrieval, background jobs, and MCP authorization are security-sensitive areas.

## Report a vulnerability

Use **Security > Report a vulnerability** on [suciudan/adluv](https://github.com/suciudan/adluv/security) when GitHub private vulnerability reporting is enabled. If that option is unavailable, open an issue requesting a private contact channel **without including vulnerability details, credentials, or personal data**.

A private report should include the affected commit and workspace, reproduction steps using synthetic data, expected impact, and relevant configuration with secrets redacted. Do not access other people's accounts or data to demonstrate impact.

Do not disclose exposed credentials, authentication bypasses, private data, or exploitable infrastructure details in public issues or pull requests. Ordinary non-sensitive bugs can use public issues.

## Scope

Reports should target the current default branch. There is no guaranteed response time or security support window for older versions or downstream deployments. Publication of this repository does not authorize testing a hosted AdLuv instance or third-party infrastructure.

Operators are responsible for maintaining their deployments, reviewing dependency advisories, protecting database and asset access, and configuring the integrations they enable.

See [Dependency audit](docs/DependencyAudit.md) for the release-preparation findings, remaining development-tool advisory, and separate deprecation notices. Re-run the audit for each release; advisory data changes over time.

## Exposed credentials

Revoke or rotate an exposed credential and inspect repository history, logs, build output, and published artifacts. Removing the string from a file does not make it safe to reuse. Do not paste the credential into a report.
