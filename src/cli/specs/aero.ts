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
      'Speaks the same tools as the AeroFortress `knowledge` server: query, explore, read, store, link, validate, pack. Works without a running Orca app.',
      '--path defaults to the current directory; the server is rooted at the nearest directory at or above it that holds .aerofortress. store, link and validate write only under .aerofortress/items.',
      'Not supported yet: agents, kanban, autopilot, goals, inbox, routines, sessions, plugin mounts and aggregate workspaces.'
    ],
    examples: ['orca aero mcp', 'orca aero mcp --path ../my-repo']
  }
]
