# Contributing to AdLuv

Contributions to any app or package are welcome. Open an issue before a substantial architectural change or new external service; focused fixes can go directly to a pull request.

## Development

1. Fork and clone the repository, then create a branch for one logical change.
2. Read [README.md](README.md), [Development](docs/Development.md), and [AGENTS.md](AGENTS.md).
3. Use Node.js 24 LTS and Yarn 4.13.0. Run `corepack enable` and `yarn install --immutable`.
4. Configure only the services your change needs. Use disposable databases and synthetic data for tests.

## Changes and validation

- Preserve nearby style and keep the diff focused. Add dependencies to the workspace that imports them; update `yarn.lock` using Yarn.
- Update `.env.example` for configuration changes. Client-visible `NEXT_PUBLIC_*` values also belong in the Turbo build environment contract in `turbo.json`; verify server output and client navigation after changing asset or origin settings.
- Include focused regression coverage for authentication, user isolation, queues, migrations, and adapter parsing. Prefer recorded synthetic fixtures to tests that depend on a live provider.
- For schema changes, generate and inspect SQL, test on a disposable database, and explain how existing data is affected. See [Database workflow](docs/database-workflow.md).
- Document source/API changes and any collection, attribution, storage, or redistribution restrictions. Do not add scraped archives or customer uploads as fixtures.

Run relevant workspace checks first, then the broader checks your change warrants:

```sh
yarn test
yarn typecheck
yarn lint
yarn build
```

Browser-flow changes also need `yarn test:e2e`, with Chromium and a dedicated disposable database configured as described in [Development](docs/Development.md#testing). Static checks alone do not establish that a user-facing flow works. Report the commands that ran, failures, and skipped checks accurately.

## Pull requests

Explain the problem, resulting behavior, affected workspaces, and validation. Include screenshots for UI changes and call out schema, dependency, configuration, and external-service changes. Keep discussions respectful and specific.

AI-assisted contributions meet the same review standard: the submitter must understand the diff, verify it, and describe material AI assistance. Do not include private prompts, credentials, personal data, or copied material without appropriate rights.

Never commit real environment files, proxy credentials, access tokens, webhooks, database dumps, uploaded media, or generated ad archives. Security-sensitive reports belong in the [private reporting process](SECURITY.md).

By submitting a contribution, you confirm that you have the right to contribute it under the repository's [MIT license](LICENSE). Preserve third-party license and attribution notices.
