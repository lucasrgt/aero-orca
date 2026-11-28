import { mkdir, mkdtemp, realpath, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { runAeroNyaGit } from '../../cli/aero/aero-nya-git'
import { readAeroKanbanPanel } from './aero-kanban-panel'
import { mutateAeroKanbanPanel } from './aero-kanban-mutation'
import { createAeroKanbanTools } from '../../cli/aero/aero-kanban-tools'

it('refuses a primary checkout outside the authorized linked worktree', async () => {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'aero-board-auth-')))
  const primary = join(temporary, 'primary')
  const linked = join(temporary, 'linked')
  try {
    await mkdir(join(primary, '.aerofortress', 'kanban'), { recursive: true })
    await runAeroNyaGit(primary, ['init'])
    await runAeroNyaGit(primary, [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      'initial'
    ])
    await runAeroNyaGit(primary, ['worktree', 'add', '-b', 'linked', linked])
    await expect(
      readAeroKanbanPanel(linked, async (path) => {
        if (path !== linked) {
          throw new Error('Outside authorized project')
        }
        return path
      })
    ).rejects.toThrow('Outside authorized project')
    await expect(
      createAeroKanbanTools(linked, {
        authorizeRoot: async () => {
          throw new Error('Final root denied')
        }
      }).call('kanban_card_add', { board: 'Denied', title: 'Denied' })
    ).rejects.toThrow('Final root denied')
    expect(await readdir(join(primary, '.aerofortress', 'kanban'))).toEqual([])
    await expect(
      mutateAeroKanbanPanel(
        { path: linked, tool: 'kanban_card_add', args: { board: 'Denied', title: 'Denied' } },
        async (path) => {
          if (path !== linked) {
            throw new Error('Outside authorized project')
          }
          return path
        }
      )
    ).rejects.toThrow('Outside authorized project')
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
