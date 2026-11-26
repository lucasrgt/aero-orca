# Keeping the fork in sync with upstream Orca

This fork (`lucasrgt/aero-orca`) tracks `stablyai/orca`. Upstream merges about 300 PRs a day,
so a fork that waits a week faces thousands of commits and dozens of conflicts. The first sync
(PR #1, 2026-11-25) took 1004 commits and 56 conflicts. **Sync often; small merges are cheap.**

## One-time setup

```bash
git remote add upstream https://github.com/stablyai/orca.git
git config rerere.enabled true        # replay conflict resolutions you already made
```

## Each sync

1. `git fetch upstream main`, then `git switch -c sync/upstream-<date> origin/main`.
2. `git merge upstream/main`.
   - **Merge, never rebase.** Fork commits keep their SHAs, and the PR shows exactly what was resolved.
   - **Code conflicts:** keep both intents. If upstream moved or deleted code the fork changed, re-apply the fork change at the new location (`git log --diff-filter=D upstream/main -- <path>` finds the move). Do not revive the old file.
   - **Locale JSON:** take the union of keys. For each conflicting value, compare base, fork and upstream. Keep the side that actually changed it, and upstream when both did. Drop keys upstream deleted.
   - **Ratchet baselines** (`config/*-baseline.txt`): take the union. Then run the ratchets and apply their `--prune` advice. A row may move to a new file only with a `# fork: why` note.
3. Run `corepack pnpm install`. Upstream changes `package.json` and the lockfile often.
4. Run the gate:
   - `corepack pnpm tc`, plus `cd mobile && corepack pnpm typecheck`;
   - `corepack pnpm exec oxlint` and `oxfmt --check` on `git diff --name-only upstream/main HEAD` (the fork's own files);
   - `corepack pnpm check:ratchets`;
   - `max-lines` can trip when both sides grew a file. Split it into a named sibling module and never raise the limit.
5. Run `vitest related --run --config config/vitest.config.ts <fork files>`.
   - On Windows, pass at most ~35 files per run; longer command lines fail.
   - For a failure, check whether it also fails at `upstream/main` before blaming the merge.
6. Smoke test with `ORCA_BACKGROUND_LAUNCH=1 corepack pnpm dev` and a CDP screenshot.
   - Dev Orca rewrites the global Claude and Codex hook configs (`~/.claude/settings.json`, `~/.codex/hooks.json`). Back them up first if you run other harnesses.
7. Open a PR `sync/upstream-<date> → main`.
8. **Keep CI off. This step is mandatory:** this fork must not spend GitHub Actions on Lucas's account.
   - A sync can add new workflow files, and new workflows start active. After the merge, disable them:
     ```bash
     gh workflow list -R lucasrgt/aero-orca --all --json id,state --jq '.[] | select(.state=="active") | .id'        | xargs -r -n1 gh workflow disable -R lucasrgt/aero-orca
     ```
   - Then cancel anything they already started: `gh run list --status queued` and `--status in_progress`, followed by `gh run cancel <id>`.
   - Verification stays local, through steps 4–6. Let the pre-commit hook run, and never `--no-verify`.

## Taking an upstream PR before it merges

```bash
git fetch upstream pull/<N>/head:pr/<N>
git diff "$(git merge-base upstream/main pr/<N>)"..pr/<N>   # only the PR's own change
git merge --no-ff pr/<N> -m "take: orca#<N> @<head sha>"
```

Upstream squash-merges. When the PR later lands upstream, `git revert -m 1 <our merge>` before
the next sync so the squash applies cleanly. Never run `pnpm install` or tests on an unreviewed PR
outside a disposable VM: postinstall and test code run as you.

## Pitfalls seen

- Never point a second worktree's `node_modules` at this one. A `pnpm install` there relinks the
  workspace packages (`node_modules/@orca/*`) into the other worktree, and they break when it is
  deleted. Re-run `corepack pnpm install` to repair.
- After a build, `git status` can list files as modified with identical content. `git add -u`
  clears it, and nothing gets staged.
