import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { renderAeroNyaScarToml } from '../../shared/aero/aero-nya-scar-format'
import { makeAeroNyaScar } from '../../shared/aero/aero-nya-test-scars'
import type { AeroNyaScar } from '../../shared/aero/aero-nya'
import { runAeroNyaGit } from './aero-nya-git'

export const NYA_CONFIG = 'schema = 1\n\n[check]\ntimeout_seconds = 60\n'

/** A git repo in a temp dir with `.nya` initialised, the given scars and one commit. Test use only. */
export async function createAeroNyaTestRepository(scars: AeroNyaScar[] = []): Promise<string> {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'aero-nya-')))
  await runAeroNyaGit(root, ['init', '-q'])
  await runAeroNyaGit(root, ['config', 'user.email', 'dev@example.com'])
  await runAeroNyaGit(root, ['config', 'user.name', 'Dev Example'])
  await runAeroNyaGit(root, ['config', 'commit.gpgsign', 'false'])
  await mkdir(join(root, '.nya', 'scars'), { recursive: true })
  await writeFile(join(root, '.nya', 'config.toml'), NYA_CONFIG)
  await writeFile(
    join(root, '.nya', '.gitignore'),
    'config.local.toml\nindex-v1.sqlite3\n.scars.lock*\n'
  )
  for (const scar of scars) {
    await writeFile(join(root, '.nya', 'scars', `${scar.id}.toml`), renderAeroNyaScarToml(scar))
  }
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src', 'App.tsx'), 'export const App = () => null\n')
  await runAeroNyaGit(root, ['add', '-A'])
  await runAeroNyaGit(root, ['commit', '-q', '-m', 'initial'])
  return root
}

export const ENGLISH_ONLY_SCAR = makeAeroNyaScar({
  id: 'NYA-01KYASTB1H12GS04SVR3CNF2M9',
  title: 'UI text must be English',
  lesson: 'All interface text is English. Never add Portuguese strings to components.',
  scope: ['src/**'],
  tags: ['ui', 'i18n']
})
