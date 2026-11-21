import { useEffect, useId, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useTranslate } from '@/i18n/use-translate'
import { useAppStore } from '@/store/index'
import {
  LOCAL_SANDBOX_GEOMETRIES,
  type LocalSandboxDockerCheck,
  type LocalSandboxGeometry
} from '../../../../../../shared/local-sandbox/local-sandbox-types'

function suggestSandboxName(existingNames: readonly string[]): string {
  const taken = new Set(existingNames.map((entry) => entry.trim().toLowerCase()))
  if (!taken.has('local sandbox')) {
    return 'Local Sandbox'
  }
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `Local Sandbox ${String(index)}`
    if (!taken.has(candidate.toLowerCase())) {
      return candidate
    }
  }
  return 'Local Sandbox'
}

export function AddLocalSandboxDialogBody({
  creating,
  onCreatingChange,
  onCreated,
  onCancel
}: {
  creating: boolean
  onCreatingChange: (creating: boolean) => void
  onCreated: (environmentId: string) => void
  onCancel: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const nameId = useId()
  const geometryId = useId()
  const shareAgentsId = useId()
  const runtimeEnvironments = useAppStore((s) => s.runtimeEnvironments)
  const setRuntimeEnvironments = useAppStore((s) => s.setRuntimeEnvironments)
  const readRuntimeHostStatusSnapshots = useAppStore((s) => s.readRuntimeHostStatusSnapshots)

  const [name, setName] = useState(() =>
    suggestSandboxName(runtimeEnvironments.map((environment) => environment.name))
  )
  const [geometry, setGeometry] = useState<LocalSandboxGeometry>('1600x900')
  const [shareHostAgents, setShareHostAgents] = useState(true)
  const [dockerCheck, setDockerCheck] = useState<LocalSandboxDockerCheck | null>(null)
  const [progressDetail, setProgressDetail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null)

  const api = window.api.runtimeEnvironments.localSandboxes
  const desktopOnlyError = t(
    'localSandbox.add.desktopOnly',
    'Local sandboxes are only available in the Orca desktop app.'
  )

  useEffect(() => {
    let active = true
    if (!api) {
      setDockerCheck({
        available: false,
        error: desktopOnlyError
      })
      return
    }
    void api.checkDocker().then(
      (result) => {
        if (active) {
          setDockerCheck(result)
        }
      },
      (cause) => {
        if (active) {
          setDockerCheck({
            available: false,
            error: cause instanceof Error ? cause.message : String(cause)
          })
        }
      }
    )
    return () => {
      active = false
    }
  }, [api, desktopOnlyError])

  useEffect(() => {
    if (!api || !creating || !activeRequestId) {
      return
    }
    return api.onCreateProgress((progress) => {
      if (progress.requestId === activeRequestId) {
        setProgressDetail(progress.detail)
      }
    })
  }, [api, creating, activeRequestId])

  const canSubmit =
    Boolean(api) && dockerCheck?.available === true && name.trim().length > 0 && !creating

  const handleSubmit = async (): Promise<void> => {
    if (!api || !canSubmit) {
      return
    }
    const requestId = `sandbox-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`
    setError(null)
    setActiveRequestId(requestId)
    setProgressDetail(t('localSandbox.add.starting', 'Preparing local sandbox…'))
    onCreatingChange(true)
    try {
      const result = await api.create({
        requestId,
        name: name.trim(),
        geometry,
        shareHostAgents
      })
      if (!result.ok) {
        setError(result.message)
        return
      }
      const environments = await window.api.runtimeEnvironments.list()
      setRuntimeEnvironments(environments)
      await readRuntimeHostStatusSnapshots()
      toast.success(
        t('localSandbox.add.created', 'Local sandbox "{{name}}" is ready.', {
          name: result.sandbox.name
        })
      )
      onCreated(result.sandbox.environmentId)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      onCreatingChange(false)
      setActiveRequestId(null)
      setProgressDetail(null)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('localSandbox.add.title', 'Add local sandbox')}</DialogTitle>
        <DialogDescription>
          {t(
            'localSandbox.add.description',
            'Start an isolated Linux desktop in Docker with its own Orca server, Chromium, AT-SPI computer use, and noVNC screen.'
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {dockerCheck && !dockerCheck.available ? (
          <div
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive"
          >
            {dockerCheck.error ??
              t('localSandbox.add.dockerUnavailable', 'Docker is required to run local sandboxes.')}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor={nameId}>{t('localSandbox.add.nameLabel', 'Name')}</Label>
          <Input
            id={nameId}
            value={name}
            disabled={creating}
            autoFocus
            placeholder={t('localSandbox.add.namePlaceholder', 'Local Sandbox')}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && canSubmit) {
                event.preventDefault()
                void handleSubmit()
              }
            }}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={geometryId}>
            {t('localSandbox.add.resolutionLabel', 'Virtual screen resolution')}
          </Label>
          <Select
            value={geometry}
            disabled={creating}
            onValueChange={(value) => {
              const matched = LOCAL_SANDBOX_GEOMETRIES.find((option) => option === value)
              if (matched) {
                setGeometry(matched)
              }
            }}
          >
            <SelectTrigger id={geometryId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LOCAL_SANDBOX_GEOMETRIES.map((option) => (
                <SelectItem key={option} value={option}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-md border border-border px-3 py-2.5">
          <div className="space-y-0.5">
            <Label htmlFor={shareAgentsId}>
              {t('localSandbox.add.shareAgentsLabel', 'Share host agent CLIs & logins')}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(
                'localSandbox.add.shareAgentsHelp',
                'Mount installed Claude, Codex, and Agy binaries read-only and seed credentials so bots work right away while keeping files isolated.'
              )}
            </p>
          </div>
          <Switch
            id={shareAgentsId}
            checked={shareHostAgents}
            disabled={creating}
            onCheckedChange={setShareHostAgents}
          />
        </div>

        {creating && progressDetail ? (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground"
          >
            <LoadingSpinner className="size-3.5 shrink-0" />
            <span>{progressDetail}</span>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="whitespace-pre-wrap text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </div>

      <DialogFooter className="sm:justify-between">
        <span className="text-2xs text-muted-foreground">
          {dockerCheck?.available && dockerCheck.version
            ? t('localSandbox.add.dockerVersion', 'Docker {{version}}', {
                version: dockerCheck.version
              })
            : null}
        </span>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={onCancel} disabled={creating}>
            {t('auto.components.sidebar.AddRemoteHostDialog.cancel', 'Cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canSubmit}>
            {creating ? <LoadingSpinner className="size-3.5" /> : null}
            {creating
              ? t('localSandbox.add.creating', 'Creating…')
              : t('localSandbox.add.create', 'Create sandbox')}
          </Button>
        </div>
      </DialogFooter>
    </>
  )
}
