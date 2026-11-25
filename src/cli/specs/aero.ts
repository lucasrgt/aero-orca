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
  }
]
