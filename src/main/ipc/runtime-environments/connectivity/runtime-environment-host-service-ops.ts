import { getAppEnvironment } from '../../../../shared/app-lifecycle/app-environment'
import { classifyRuntimeEnvironmentHost } from '../../../../shared/remote-runtime/host-catalog/runtime-environment-host-kind'
import type { KnownRuntimeEnvironment } from '../../../../shared/remote-runtime/host-catalog/runtime-environments'
import type { WslHostServerStop } from '../../../../shared/remote-runtime/wsl-hosts/wsl-host-types'
import { ensureLocalSandboxStartedForEnvironment } from '../../../local-sandbox/local-sandbox-service'
import { getWslHostService } from '../../../wsl/host-lifecycle/wsl-host-service-instance'

/** Explicit connection may boot the WSL distro or a stopped local sandbox container. */
export async function connectThroughOwningService(
  environment: KnownRuntimeEnvironment
): Promise<void> {
  const host = classifyRuntimeEnvironmentHost(environment)
  switch (host.kind) {
    case 'wsl':
      await getWslHostService()?.connect(environment.id)
      break
    case 'network':
      await ensureLocalSandboxStartedForEnvironment(
        getAppEnvironment().getPath('userData'),
        environment.id
      )
      break
    case 'ssh':
      break
  }
}

/** Null delegates removal to the generic store path. */
export function removeThroughOwningService(
  environment: KnownRuntimeEnvironment
): Promise<WslHostServerStop> | null {
  const host = classifyRuntimeEnvironmentHost(environment)
  switch (host.kind) {
    case 'wsl':
      // Also releases the distro's holder and drops the WSL record.
      return getWslHostService()?.remove(environment.id) ?? null
    case 'network':
    case 'ssh':
      return null
  }
}
