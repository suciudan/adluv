# MySQL setup

Use MySQL 8 with a dedicated schema and database account. The [Development guide](Development.md#database-and-configuration) contains local setup examples and explains `DATABASE_URL`.

Initialize an empty database with `yarn db:push`, then run `yarn db:verify`. See [Database workflow](database-workflow.md) for the historical migration limitations, and [Deployment](Deployment.md) before changing an existing installation.
