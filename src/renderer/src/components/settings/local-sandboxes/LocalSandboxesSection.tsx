import { useCallback, useEffect, useState } from 'react'
import { Monitor, Play, Plus, Square, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { useTranslate } from '@/i18n/use-translate'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import type { LocalSandboxSummary } from '../../../../../shared/local-sandbox/local-sandbox-types'
import {
  AddRemoteHostDialog,
  type AddRemoteHostMode
} from '../../sidebar/host-admission/ssh/AddRemoteHostDialog'
import { ServerListRow, type ServerRowStatus } from '../host-rows/ServerListRow'

function sandboxRowStatus(
  status: LocalSandboxSummary['status'],
  t: ReturnType<typeof useTranslate>
): ServerRowStatus {
  if (status === 'running') {
    return { label: t('localSandbox.status.running', 'Running'), tone: 'success' }
  }
  if (status === 'stopped') {
    return { label: t('localSandbox.status.stopped', 'Stopped'), tone: 'muted' }
  }
  return { label: t('localSandbox.status.missing', 'Missing'), tone: 'warning' }
}

export function LocalSandboxesSection({
  onChanged
}: {
  onChanged?: () => void
}): React.JSX.Element | null {
  const t = useTranslate()
  const api = window.api.runtimeEnvironments.localSandboxes
  const [sandboxes, setSandboxes] = useState<LocalSandboxSummary[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<AddRemoteHostMode | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    if (!api) {
      return
    }
    try {
      setSandboxes(await api.list())
    } catch {
      /* Ignore transient list failures when Docker is unavailable. */
    }
  }, [api])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (!api) {
    return null
  }

  const runAction = async (
    id: string,
    action: () => Promise<{ ok: boolean; message?: string }>,
    successMessage: string
  ): Promise<void> => {
    setBusyId(id)
    await action()
      .then(async (result) => {
        if (!result.ok) {
          toast.error(result.message ?? t('localSandbox.actionFailed', 'Sandbox action failed.'))
          return
        }
        toast.success(successMessage)
        await refresh()
        onChanged?.()
      })
      .finally(() => setBusyId(null))
  }

  return (
    <div className="space-y-3 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <h3 className="text-sm font-medium text-foreground">
            {t('localSandbox.section.title', 'Local sandboxes')}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t(
              'localSandbox.section.description',
              'Isolated Docker Linux desktops with built-in Orca servers and noVNC screens.'
            )}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setDialogMode('sandbox')}>
          <Plus className="size-3.5" />
          {t('localSandbox.section.add', 'Add local sandbox')}
        </Button>
      </div>

      {sandboxes.length > 0 ? (
        <div className="divide-y divide-border rounded-lg border border-border bg-card">
          {sandboxes.map((sandbox) => {
            const busy = busyId === sandbox.id
            const running = sandbox.status === 'running'
            return (
              <ServerListRow
                key={sandbox.id}
                name={sandbox.name}
                meta={
                  <span className="truncate font-mono text-2xs text-muted-foreground">
                    {sandbox.containerName} · {sandbox.geometry}
                  </span>
                }
                status={sandboxRowStatus(sandbox.status, t)}
                primaryAction={
                  <div className="flex items-center gap-1.5">
                    {running ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={busy}
                        onClick={() => openAppHttpLink(sandbox.screenUrl)}
                      >
                        <Monitor className="size-3" />
                        {t('localSandbox.actions.openScreen', 'Open screen')}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          sandbox.id,
                          () =>
                            running ? api.stop({ id: sandbox.id }) : api.start({ id: sandbox.id }),
                          running
                            ? t('localSandbox.actions.stopped', 'Sandbox stopped.')
                            : t('localSandbox.actions.started', 'Sandbox started.')
                        )
                      }
                    >
                      {busy ? (
                        <LoadingSpinner className="size-3" />
                      ) : running ? (
                        <Square className="size-3" />
                      ) : (
                        <Play className="size-3" />
                      )}
                      {running
                        ? t('localSandbox.actions.stop', 'Stop')
                        : t('localSandbox.actions.start', 'Start')}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      disabled={busy}
                      aria-label={t('localSandbox.actions.remove', 'Remove sandbox')}
                      onClick={() =>
                        void runAction(
                          sandbox.id,
                          () => api.remove({ id: sandbox.id, deleteVolume: true }),
                          t('localSandbox.actions.removed', 'Sandbox removed.')
                        )
                      }
                    >
                      <Trash2 className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                }
              />
            )
          })}
        </div>
      ) : null}

      <AddRemoteHostDialog
        mode={dialogMode}
        onOpenChange={(next) => {
          setDialogMode(next)
          if (next === null) {
            void refresh()
            onChanged?.()
          }
        }}
      />
    </div>
  )
}
