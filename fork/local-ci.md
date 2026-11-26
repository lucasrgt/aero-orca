# Local CI: the gate that replaces GitHub Actions on this fork

GitHub Actions is **off** on `lucasrgt/aero-orca`, because every run is billed to the owner's
account (see step 8 of [upstream-sync.md](./upstream-sync.md)). The checks `pr.yml` would run
therefore run on the developer's machine. **No PR merges until they pass locally.**

## Rules

- Run the gate on the PR branch, rebased on (or merged with) the current `origin/main`, before you merge.
- Paste the real outcome into the PR description under **Verification**: the commands, pass or
  fail, and test counts. Never write "CI green". No CI ran.
- When a check fails, run the same check on `origin/main`. A failure that reproduces there is
  pre-existing: name it in the PR and move on. Anything else blocks the merge until it is fixed.
- Never re-enable a workflow or start one with `gh workflow run` to "double-check".
- The pre-commit hook still runs. Never `--no-verify`.

## The gate: every PR

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm check:changed --base=origin/main
```

`check:changed` is upstream's own pre-handoff gate (see `AGENTS.md`). It reads the diff against
the base and runs, in parallel, what those paths need: format, lint, typecheck, the unit tests
that import the changed files, and the ratchets the paths select. Those are the `preflight`,
`typecheck`, `preflight_ratchets` and `test` jobs of `pr.yml`. It caches a pass by content hash,
so rerun it only after the diff changes. Use `--force` to ignore the cache.

## Extra gates by kind of change

Run the matching rows as well. Each mirrors a job in `pr.yml` that `check:changed` does not cover.

| The PR touches | Also run |
|---|---|
| An upstream sync (`sync/upstream-*`) | Everything in [upstream-sync.md](./upstream-sync.md) steps 4–6, plus the generated-artifact checks below |
| Generated sources (RPC params, ACP protocol, bundled skills) | `pnpm verify:rpc-params-catalog`, `pnpm verify:acp-protocol`, `pnpm verify:bundled-skill-guides`, `pnpm verify:skill-bundle-manifest` |
| Locale catalogs or user-facing strings | `pnpm verify:localization-catalogs` and `pnpm verify:localization-coverage` (the first needs [Bun](https://bun.sh)) |
| `mobile/` | `cd mobile && corepack pnpm typecheck`, then `pnpm build:mobile-web` |
| The daemon wire protocol | `pnpm check:daemon-protocol-crossing` |
| A CLI command, MCP tool or app behaviour | Prove it by running it for real against a **temporary copy** of a repo, never a live one, and paste the output |

## Windows notes

- Vitest fails with "command line too long" when given too many files. Pass at most ~35 files
  per run.
- A few suites fail on Windows at upstream too (EPERM on temp dirs, `HOME`-dependent paths).
  Check them against `origin/main` before blaming the PR.
