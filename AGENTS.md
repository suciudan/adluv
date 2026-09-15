## Frontend Rules

- Prefer standard Tailwind utility classes over arbitrary values when a built-in utility exists.
- Avoid arbitrary tracking utilities such as `tracking-[-0.04em]`; use Tailwind's default typography and spacing scale unless there is a hard visual requirement.
- Use `violet-500` as the accent color unless the existing UI in that specific surface clearly uses a different accent token.

## Build And Env Rules

- Never say a task is finished until the changed behavior has been tested and confirmed working. If only typecheck, lint, or partial smoke tests were run, say that explicitly and do not describe the work as done.
- For bug fixes, never claim the bug is fixed, resolved, or repaired unless the actual failing behavior has been reproduced and then confirmed working after the change. Unit tests, typecheck, lint, code inspection, or a dry-run only prove partial confidence; describe them as partial verification and state exactly what was not confirmed.
- Do not present a production repair command as the fix unless it has been run against the affected production/prod-like data and the resulting user-visible behavior has been checked. If that cannot be done locally, say the command is the next thing to try, not that it will fix the issue.
- When starting the app locally, use `http://127.0.0.1:3001`, or the origin explicitly configured for your installation.
- Treat any `NEXT_PUBLIC_*` variable as part of the client build contract, not just runtime config.
- When adding or changing a client-visible env var, update every place that controls the build graph as part of the same change. In this repo that includes `turbo.json` `tasks.build.env`.
- Never assume that writing a value to `.env.local` or CI secrets is enough for Turbo builds. If the variable is not declared in `turbo.json`, the client bundle may be built without it even when server rendering works.
- After changing env-driven asset or URL logic, verify both outputs:
  - server-rendered output in `.next/server`
  - client bundles in `.next/static`
- If a bug appears only after client-side navigation, check for an SSR/client mismatch before changing component logic. A correct first load with a broken `home -> blog -> home` flow usually means the client bundle and server output disagree.
- For CDN or asset URL changes, confirm the built client chunks contain the expected host string, not just the rendered HTML.
- When debugging production-only Next.js issues, separate these questions explicitly:
  - Is the server HTML correct?
  - Is the hydrated client bundle using the same config?
  - Does the bug happen only after SPA navigation?
