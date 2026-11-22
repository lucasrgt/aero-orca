import type { CommandSpec } from '../discovery/command-spec'
import { CLI_GLOBAL_FLAGS as GLOBAL_FLAGS } from '../../shared/cli/cli-argument-boundary'

export const BOT_IMPORT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['bot', 'import', 'sources'],
    summary: 'List the bots OpenClaw, Hermes and OpenBot keep on this computer, and their folders',
    usage: 'orca bot import sources [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: ['Reads folder names only; it opens no config, keys or databases.']
  },
  {
    path: ['bot', 'import', 'read'],
    summary:
      "Read another app's file for an import, with anything that looks like a secret left out",
    usage: 'orca bot import read <file|folder|->',
    allowedFlags: [...GLOBAL_FLAGS, 'path'],
    positionalArgs: ['path'],
    notes: [
      'A folder lists its files and marks the ones never read. - reads what another command pipes in.',
      'Refuses key, login and chat-history files (.env, auth.json, credentials/, sessions/ and the like), and replaces each line that looks like it holds a secret.'
    ]
  },
  {
    path: ['bot', 'import', 'plan'],
    summary:
      'Show your owner your plan for bringing a bot over from another app, as a card in your chat',
    usage: 'orca bot import plan --file <plan.json> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'file'],
    notes: [
      'Run it from your chat. The file is JSON: {"app","name","again"?,"items":[{"group":"comes|changed|already|stays","what","to"?,"why"}]}.',
      'Your owner ticks what to bring and answers in this chat; write nothing before that answer.'
    ]
  },
  {
    path: ['bot', 'import', 'done'],
    summary: 'Show your owner what an import brought over, as a summary card in your chat',
    usage: 'orca bot import done --file <done.json> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'file'],
    notes: [
      'Run it from your chat. The file is JSON: {"app","name","created":[{"kind":"soul|memory|abilities|automations|tools|other","what","detail"?}],"stayed":[...],"paused":<schedules created paused>}.'
    ]
  }
]
