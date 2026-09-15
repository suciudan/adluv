# Publishing the source

The public repository is intended for `suciudan/adluv`. Publish a reviewed source snapshot with a fresh Git history for the initial release. Keep the former private repository separate: changing its visibility or pushing its old branches can expose files removed from the current tree.

## Prepare and verify

1. Review the source, example environment, dependency audit, third-party notices, and all workflow triggers. Local credentials, proxy lists, uploaded media, browser artifacts, database dumps, and private deployment notes do not belong in the release.
2. Follow [CONTRIBUTING.md](../CONTRIBUTING.md) to install the pinned dependencies and run the checks. Unit tests and compilation do not verify a production deployment. Run the database and browser suite only against disposable services.
3. Export the reviewed tree to a **new directory outside the repository**:

   ```sh
   python3 scripts/export-public-source.py ../adluv-public
   ```

   The exporter includes current source edits and new non-ignored files, honors deletions and ignore rules even for tracked files, rejects symlinks and existing destinations, and never copies `.git`.
4. Scan the export with Gitleaks 8.30.1 or a compatible later version:

   ```sh
   gitleaks dir ../adluv-public --config .gitleaks.toml --redact \
     --max-decode-depth 2 --max-archive-depth 2
   ```

   Retain built-in detectors and the repository's proxy-credential detector. Review results rather than adding broad allowlists. Keep reports with private paths or data outside the public tree. A clean scan does not prove the absence of all confidential information.

## First GitHub publication

From the reviewed export, initialize a new repository, inspect the staged file list, and create the initial commit:

```sh
git init -b main
git add .
git diff --cached --stat
git commit -m "Prepare Adluv open-source release"
```

Verify that the new history contains only the reviewed snapshot and scan it again:

```sh
git rev-list --count HEAD
gitleaks git . --config .gitleaks.toml --redact --log-opts=--all \
  --max-decode-depth 2 --max-archive-depth 2
```

After reviewing the repository name, owner and public visibility, publication can use:

```sh
gh repo create suciudan/adluv --public --source=. --remote=origin --push \
  --description "Open-source ad intelligence for LinkedIn, Meta, and Google."
```

If that name already exists or redirects to another repository, resolve the GitHub namespace first. Do not repurpose or change the visibility of the old private repository as a shortcut. Never use a mirror push for this import. Publishing the source does not deploy an application or publish npm packages.

## Repository settings

- Enable Issues and private vulnerability reporting, then verify the reporting link in [SECURITY.md](../SECURITY.md).
- Enable secret scanning, push protection and dependency alerts where available.
- Run contribution checks on GitHub-hosted runners. Keep production credentials and self-hosted runners out of the public repository.
- After the first successful CI run, protect `main` against force pushes/deletion and require the relevant checks for pull requests.
- Configure deployment separately for your infrastructure; the source release includes service examples, not the former operator's deployment workflows.

Subsequent contributions should use the public repository's normal history and preserve all upstream notices.
