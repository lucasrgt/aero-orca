import type { CommandSpec } from '../discovery/command-spec'
import { LOCAL_COMMAND_FLAGS } from '../arguments/args'

export const AERO_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['aero', 'inspect'],
    summary:
      'Report the AeroFortress artifacts (knowledge, boards, autopilot, routines) found in a repo',
    usage: 'orca aero inspect [--path <repo>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'path'],
    notes: [
      'Read-only: reads .aerofortress/ and .nya/ and never writes. Works without a running Orca app.',
      '--path defaults to the current directory. Files that do not parse are listed as issues; one bad file never fails the whole read.'
    ],
    examples: ['orca aero inspect', 'orca aero inspect --path ../my-repo --json']
  },
  {
    path: ['aero', 'mcp'],
    summary: "Serve a repo's AeroFortress knowledge network to an agent as an MCP server (stdio)",
    usage: 'orca aero mcp [--path <repo>]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'path'],
    notes: [
      'Speaks the same tools as the AeroFortress `knowledge` server: query, explore, read, store, link, validate, pack; the Kanban tools kanban_board, kanban_board_create, kanban_board_mode, kanban_board_pipeline, kanban_column_pipeline, kanban_card_add, kanban_card_update, kanban_card_move, kanban_card_remove, kanban_card_link, kanban_card_unlink, kanban_card_answer; and the Not You Again tools nya_recall, nya_remember, nya_check. Works without a running Orca app.',
      '--path defaults to the current directory; the server is rooted at the nearest directory at or above it that holds .aerofortress. store, link and validate write only under .aerofortress/items.',
      'The Kanban tools write .aerofortress/kanban/<board>.toml. From a linked git worktree they use the boards of the primary checkout, so every worktree shares one board; each result names the file in board_path. A board is rewritten only when it is in the exact form AeroFortress writes (anything else, or a file that does not parse, is refused untouched), and only the fields an edit touches change. Moving a card to done returns what it unblocks in unblocked, instead of an inbox note.',
      'Not supported yet: agents, kanban_card_triage, kanban_card_attach, orphaned-card detection, autopilot, goals, inbox, routines, sessions, plugin mounts, aggregate workspaces, and the administrative Not You Again tools (nya_init, nya_setup, nya_collect, nya_spec, nya_replay).'
    ],
    examples: ['orca aero mcp', 'orca aero mcp --path ../my-repo']
  },
  {
    path: ['aero', 'hook', 'session-start'],
    summary: 'Agent hook: print the AeroFortress workspace pack as session context (JSON)',
    usage: 'orca aero hook session-start < hook-input.json',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    notes: [
      'For a SessionStart hook of Claude Code or Codex. Reads the hook JSON from stdin (cwd) and prints {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":...}} with the constitution, digests and best-ranked items of the nearest .aerofortress, within 12k characters. Prints nothing when the folder has no .aerofortress.',
      'Never fails the agent: every error is a line on stderr, an empty stdout and exit 0. Local only.'
    ],
    examples: ['echo \'{"cwd":"."}\' | orca aero hook session-start']
  },
  {
    path: ['aero', 'hook', 'prompt-submit'],
    summary: 'Agent hook: print the Not You Again scars relevant to a prompt as context (JSON)',
    usage: 'orca aero hook prompt-submit < hook-input.json',
    allowedFlags: [...LOCAL_COMMAND_FLAGS],
    notes: [
      'For a UserPromptSubmit hook of Claude Code or Codex. Reads the hook JSON from stdin (cwd, prompt), recalls up to 8 scars for the prompt and prints them in a <NOT_YOU_AGAIN> envelope as additionalContext, as AeroFortress does before each turn. Prints nothing when .nya is not initialized or no scar is relevant; a failed recall prints a <NOT_YOU_AGAIN_ERROR> envelope so the agent cannot claim the gate passed.',
      'Never fails the agent: every other error is a line on stderr, an empty stdout and exit 0. Local only.'
    ],
    examples: [
      'echo \'{"cwd":".","prompt":"fix the codex stop handling"}\' | orca aero hook prompt-submit'
    ]
  },
  {
    path: ['aero', 'nya', 'recall'],
    summary: 'Recall the Not You Again scars (reusable lessons) relevant to a task and its paths',
    usage:
      'orca aero nya recall --task <text> [--paths <glob>]... [--limit <n>] [--path <repo>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'path', 'task', 'paths', 'limit'],
    repeatableFlags: ['paths'],
    notes: [
      'Reads .nya/scars of the git repo that holds --path (default: the current directory); never writes. Ranks like AeroFortress: scope match and text match first, then text match, then scope match, at most --limit (default 12, max 40).',
      '--paths names the repository-relative files you expect to touch (repeatable); each scar scope glob is matched against them.'
    ],
    examples: [
      'orca aero nya recall --task "fix codex stop handling" --paths src-tauri/src/codex.rs',
      'orca aero nya recall --task "add a setting" --paths src/App.tsx --paths src/api.ts --json'
    ]
  },
  {
    path: ['aero', 'nya', 'remember'],
    summary:
      'Record a corrected, reusable failure as a Not You Again scar, or append an occurrence',
    usage:
      'orca aero nya remember (--title <text> --lesson <text> --scope <glob>... | --scar <id>) [--tag <tag>]... [--source <text> --reported-by <actor> | --github-review <permalink>] [--corrected-by <actor>] [--recorded-by <actor>] [--path <repo>] [--json]',
    allowedFlags: [
      ...LOCAL_COMMAND_FLAGS,
      'path',
      'scar',
      'title',
      'lesson',
      'scope',
      'tag',
      'source',
      'github-review',
      'reported-by',
      'corrected-by',
      'recorded-by'
    ],
    repeatableFlags: ['scope', 'tag'],
    notes: [
      'Writes one file under .nya/scars of the git repo that holds --path, atomically (flushed to disk before the rename) and under a lock kept in the git dir of the repo, so no lock file shows up in the work tree; the repo must already have .nya/scars. Never record hypotheses, generic best practices or preferences.',
      'A new scar needs --title, --lesson and at least one --scope glob (** only when truly repository-wide). --scar <id>, or a --title that matches an existing scar, appends an occurrence instead. Actors are namespaced (git:you@example.com); the git user.email and HEAD are recorded when not given.',
      '--github-review reads a #discussion_r permalink of github.com through your own gh CLI (another host is refused so gh never sends its token there; AeroFortress also accepts enterprise hosts) and is exclusive with --source and --reported-by.',
      'Limit: the lock only orders the writers of this CLI and the MCP server. AeroFortress writes scars without taking it, so a write racing one of its own can still lose an occurrence.'
    ],
    examples: [
      'orca aero nya remember --title "Guessed the org in a URL" --lesson "Read the remote with git remote -v, never from memory." --scope "**" --tag docs'
    ]
  },
  {
    path: ['aero', 'nya', 'check'],
    summary: 'Audit the git diff for a recurrence of a known scar with an isolated LLM judge',
    usage: 'orca aero nya check [--base <rev>] [--path <repo>] [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'path', 'base'],
    notes: [
      'Audits git diff <base> (default HEAD: staged and unstaged work) plus untracked files, excluding .nya, against the scars whose scope covers each changed path. Exits 1 when a recurrence is confirmed.',
      'The judge is the one .nya/config.local.toml selects by name (claude, codex or hermes, run read-only with no tools, in an empty directory, the arguments never through a shell), else the one of your own nya config (the file NYA_CONFIG names, else nya/config.toml in your user config directory), bounded by [check] timeout_seconds of .nya/config.toml, at most 2147483. A judge failure is an error, never a pass.',
      'A custom judge command is accepted only from your own nya config outside the repository, and when that config names one it wins over the judge .nya/config.local.toml selects, so a clone cannot redirect the diff to a cloud judge. NYA_CONFIG must be an absolute path, and a relative XDG_CONFIG_HOME is ignored. A .nya/config.local.toml that names a command is refused, whatever its path or git state, because a clone can carry that file; .nya must also be a real directory, not a link.',
      'Untracked files are read whole, whatever their size; one that is not valid UTF-8 counts as empty, as in AeroFortress, and a symlink is never followed. A file Node cannot read whole (past 2 GiB, or too long for a string) fails the check instead of passing unaudited.',
      'Limits: a diff is data the judge reads, so text inside it can still talk the judge into returning no findings (AeroFortress has the same limit); a clean check is evidence, not proof. The CSM_STORAGE_ROOT variable of AeroFortress is not supported.',
      'Not supported yet: nya collect, spec, replay, init and setup.'
    ],
    examples: ['orca aero nya check', 'orca aero nya check --base origin/main --json']
  }
]
