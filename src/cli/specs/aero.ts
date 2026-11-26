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
      'Speaks the same tools as the AeroFortress `knowledge` server: query, explore, read, store, link, validate, pack, and the Not You Again tools nya_recall, nya_remember, nya_check. Works without a running Orca app.',
      '--path defaults to the current directory; the server is rooted at the nearest directory at or above it that holds .aerofortress. store, link and validate write only under .aerofortress/items.',
      'Not supported yet: agents, kanban, autopilot, goals, inbox, routines, sessions, plugin mounts, aggregate workspaces, and the administrative Not You Again tools (nya_init, nya_setup, nya_collect, nya_spec, nya_replay).'
    ],
    examples: ['orca aero mcp', 'orca aero mcp --path ../my-repo']
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
      'The judge is the one of .nya/config.local.toml or the user nya config (claude, codex or hermes, run read-only with no tools, in an empty directory, the arguments never through a shell), bounded by [check] timeout_seconds of .nya/config.toml. A judge failure is an error, never a pass.',
      'A judge command (a custom judge) is only accepted from .nya/config.local.toml when git reports that file as untracked and ignored and .nya is a real directory, so a clone cannot choose what runs; a built-in judge name has no such condition. [check] timeout_seconds must be at most 2147483.',
      'Untracked files are read whole, whatever their size; one that is not valid UTF-8 counts as empty, as in AeroFortress, and a symlink is never followed.',
      'Limits: a diff is data the judge reads, so text inside it can still talk the judge into returning no findings (AeroFortress has the same limit); a clean check is evidence, not proof. The CSM_STORAGE_ROOT variable of AeroFortress is not supported.',
      'Not supported yet: nya collect, spec, replay, init and setup.'
    ],
    examples: ['orca aero nya check', 'orca aero nya check --base origin/main --json']
  }
]
