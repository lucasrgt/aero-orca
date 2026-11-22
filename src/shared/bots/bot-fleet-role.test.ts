import { describe, expect, it } from 'vitest'
import { buildBotFleetSection } from './bot-fleet-role'
import { buildBotSidebarRows } from './bot-project-groups'

describe('buildBotFleetSection', () => {
  const fleet = [
    { id: '1', name: 'Host Point', project: 'Host Point', role: 'admiral' as const },
    {
      id: '2',
      name: 'Viajantes',
      project: 'Host Point',
      role: 'captain' as const,
      territory: 'apps/travelers, backend/lib/hostpoint/travelers.ex'
    },
    {
      id: '3',
      name: 'Anfitriões',
      project: 'Host Point',
      role: 'captain' as const,
      territory: 'apps/hosts, backend/lib/hostpoint/hosts.ex'
    },
    { id: '4', name: 'Lucro Caseiro', project: 'Lucro Caseiro', role: 'admiral' as const },
    { id: '5', name: 'General Bot', project: 'Host Point' }
  ]

  it('lists same-project captains for a project Admiral', () => {
    const section = buildBotFleetSection(fleet[0]!, fleet, 'orca')
    expect(section).toContain('Fleet Role: Admiral (Host Point)')
    expect(section).toContain('**Viajantes** (`bot:Viajantes`) — apps/travelers')
    expect(section).toContain('**Anfitriões**')
    expect(section).not.toContain('Lucro Caseiro')
    expect(section).not.toContain('General Bot')
  })

  it('gives a Territory Captain its territory, project Admiral, and sibling captains', () => {
    const section = buildBotFleetSection(fleet[1]!, fleet, 'orca')
    expect(section).toContain('Fleet Role: Territory Captain (Host Point)')
    expect(section).toContain(
      '**Your territory:** apps/travelers, backend/lib/hostpoint/travelers.ex'
    )
    expect(section).toContain('**Project Admiral:** **Host Point** (`"bot:Host Point"`)')
    expect(section).toContain('**Anfitriões**')
    expect(section).not.toContain('Lucro Caseiro')
  })

  it('lists project Admirals for a global Fleet Admiral without a project', () => {
    const chief = { id: '0', name: 'Orca Chief', role: 'admiral' as const }
    const section = buildBotFleetSection(chief, [chief, ...fleet], 'orca')
    expect(section).toContain('Fleet Role: Fleet Admiral')
    expect(section).toContain('**Host Point** [Host Point]')
    expect(section).toContain('**Lucro Caseiro** [Lucro Caseiro]')
  })

  it('returns null for standard bots without a role', () => {
    expect(buildBotFleetSection(fleet[4]!, fleet, 'orca')).toBeNull()
  })
})

describe('buildBotSidebarRows fleet ordering', () => {
  it('places Admirals first with a fleet divider before Captains inside each project group', () => {
    const entries = [
      { id: 'std', kind: 'bot' as const, bot: { project: 'Host Point' } },
      { id: 'cap', kind: 'bot' as const, bot: { project: 'Host Point', role: 'captain' as const } },
      { id: 'adm', kind: 'bot' as const, bot: { project: 'Host Point', role: 'admiral' as const } }
    ]
    const { rows } = buildBotSidebarRows(entries, 'project', new Set())
    expect(
      rows.map((row) =>
        row.kind === 'project-header'
          ? `header:${row.projectKey}`
          : row.kind === 'fleet-divider'
            ? `divider:${row.projectKey}:${row.count}`
            : row.id
      )
    ).toEqual(['header:host point', 'adm', 'divider:host point:1', 'cap', 'std'])
  })

  it('pins global Admirals at the very top outside any General folder and separates the first project', () => {
    const entries = [
      { id: 'cap', kind: 'bot' as const, bot: { project: 'Host Point', role: 'captain' as const } },
      { id: 'global-adm', kind: 'bot' as const, bot: { role: 'admiral' as const } }
    ]
    const { rows } = buildBotSidebarRows(entries, 'project', new Set())
    expect(
      rows.map((row) =>
        row.kind === 'project-header'
          ? `header:${row.projectKey}:${Boolean(row.afterGlobalAdmiral)}`
          : row.kind === 'fleet-divider'
            ? `divider:${row.projectKey}`
            : `${row.id}:${row.grouped}`
      )
    ).toEqual(['global-adm:false', 'header:host point:true', 'cap:true'])
  })
})
