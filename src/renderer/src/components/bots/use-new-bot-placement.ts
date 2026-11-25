import { useState } from 'react'
import type { BotRole } from '../../../../shared/bots/bot-fleet-role'
import type { BotCreateParams } from '../../../../shared/rpc-contract/bots-params'

/** The New bot dialog's project, fleet role and territory: what it shows, sends and clears. */
export function useNewBotPlacement(initialProject: string | undefined): {
  fieldProps: {
    project: string
    role: BotRole | null
    territory: string
    onProjectChange: (project: string) => void
    onRoleChange: (role: BotRole | null) => void
    onTerritoryChange: (territory: string) => void
  }
  createParams: Pick<BotCreateParams, 'project' | 'role' | 'territory'>
  reset: () => void
} {
  const [project, setProject] = useState(initialProject ?? '')
  const [role, setRole] = useState<BotRole | null>(null)
  const [territory, setTerritory] = useState('')
  const [seenInitialProject, setSeenInitialProject] = useState(initialProject)
  if (seenInitialProject !== initialProject) {
    setSeenInitialProject(initialProject)
    setProject(initialProject ?? '')
  }
  return {
    fieldProps: {
      project,
      role,
      territory,
      onProjectChange: setProject,
      onRoleChange: setRole,
      onTerritoryChange: setTerritory
    },
    createParams: {
      ...(project.trim() ? { project: project.trim() } : {}),
      ...(role ? { role } : {}),
      ...(role === 'captain' && territory.trim() ? { territory: territory.trim() } : {})
    },
    reset: () => {
      setProject(initialProject ?? '')
      setRole(null)
      setTerritory('')
    }
  }
}
