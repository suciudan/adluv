# Database workflow

AdLuv uses MySQL and Drizzle. Schema definitions live in `packages/db/src/schema/app.ts`; historical migration SQL and metadata live in `packages/db/drizzle/`.

## Fresh installation

Create an **empty** MySQL 8 database and configure `DATABASE_URL` as described in [Development](Development.md), then initialize it from the current schema:

```sh
yarn db:push
yarn db:verify
```

This route was verified against a fresh MySQL 8.4 database during release preparation. The scripts connect to an existing schema; they do not provision MySQL or create its database/user for you.

The checked-in historical migration chain does not bootstrap a fresh database: it creates legacy auth tables and later refers to Better Auth tables without the intervening transition. Do not use `db:migrate` for a fresh installation. Existing databases need a reviewed upgrade plan based on their actual schema and data.

## Commands

| Command | Actual behavior |
| --- | --- |
| `yarn db:generate` | Generates Drizzle migration SQL and metadata from schema changes |
| `yarn db:check` | Checks consistency of Drizzle migration metadata; does not inspect the live database |
| `yarn db:migrate` | Runs `packages/db/scripts/migrate.mjs`, applies historical journal entries, and records applied tags in `__adluv_migrations` |
| `yarn db:verify` | Checks expected tables and selected critical runtime columns in the connected MySQL database |
| `yarn db:push` | Runs Drizzle's direct schema-push workflow against the connected database |
| `yarn db:repair-migrations` | Rebuilds migration-journal metadata; an operator repair tool, not routine setup |

`db:migrate` and `db:push` are different workflows. The custom migration runner skips tags already recorded and can mark known pre-existing schema states as baselined. It does not perform a complete drift comparison, and `db:verify` is not a full integrity audit.

## Schema changes

1. Edit the Drizzle schema.
2. Generate and inspect SQL and metadata, accounting for the historical chain's limitations.
3. Run `yarn db:check`.
4. Rehearse the intended changes on a disposable database and a restored copy of representative existing data.
5. Run `yarn db:verify` and exercise the changed behavior.
6. Include migration compatibility and recovery notes with the change.

Use `db:push` for empty setup or deliberate synchronization of disposable development databases. Do not substitute a schema push for reviewing upgrade SQL against existing data.

## Existing installations

Back up the target database, review every proposed schema change, and rehearse on a restored copy before rollout. MySQL DDL can implicitly commit even though the runner uses transaction calls; a failure may leave partially applied changes. Investigate that state before retrying or editing the journal.

Stop processes that cannot tolerate the schema transition, apply the reviewed changes, verify, and start compatible app and worker versions. Read [Deployment](Deployment.md) for the wider rollout sequence. Never recreate a non-disposable database to clear drift.
