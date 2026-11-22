// The ::orca-screen{...} card: an inline live PC screen preview that opens directly in Orca on click.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Eye, Maximize2, Monitor, MousePointerClick, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import { useWebviewDragPassthroughActive } from '@/components/browser-pane/host-guest/drag/use-webview-drag-passthrough-active'
import type { LocalScreenEntry } from '../../../../shared/local-sandbox/local-sandbox-types'
import { pickMatchingLocalScreen } from '../../../../shared/local-sandbox/local-screen-discovery-utils'
import {
  isLocalScreenUrl,
  type NativeChatScreenDirective
} from '../../../../shared/native-chat/visuals/native-chat-visual-directive'
import type { NativeChatVisualOwner } from './media/visuals/native-chat-visual-owner'

type ScreenResolutionState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; label: string; containerName: string | null }
  | { status: 'unavailable' }

function buildPreviewFrameUrl(screenUrl: string, interactive: boolean): string {
  try {
    const parsed = new URL(screenUrl)
    if (!parsed.searchParams.has('autoconnect')) {
      parsed.searchParams.set('autoconnect', '1')
    }
    if (!parsed.searchParams.has('resize')) {
      parsed.searchParams.set('resize', 'scale')
    }
    if (!parsed.searchParams.has('bell')) {
      parsed.searchParams.set('bell', 'off')
    }
    if (interactive) {
      parsed.searchParams.delete('view_only')
    } else {
      parsed.searchParams.set('view_only', '1')
    }
    return parsed.toString()
  } catch {
    return screenUrl
  }
}

function resolveFromScreens(
  screens: readonly LocalScreenEntry[],
  directive: NativeChatScreenDirective,
  environmentId: string | null
): ScreenResolutionState {
  const match = pickMatchingLocalScreen(screens, {
    selector: directive.sandbox,
    environmentId
  })
  if (!match || !isLocalScreenUrl(match.screenUrl)) {
    return { status: 'unavailable' }
  }
  return {
    status: 'ready',
    url: match.screenUrl,
    label: directive.title ?? match.name,
    containerName: match.containerName
  }
}

export function NativeChatScreenCard({
  owner,
  directive
}: {
  owner: NativeChatVisualOwner
  directive: NativeChatScreenDirective
}): React.JSX.Element {
  const t = useTranslate()
  const dragPassthrough = useWebviewDragPassthroughActive()
  const environmentId = owner.target.kind === 'environment' ? owner.target.environmentId : null
  const [interactive, setInteractive] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
  const [resolved, setResolved] = useState<ScreenResolutionState>(() =>
    directive.url && isLocalScreenUrl(directive.url)
      ? {
          status: 'ready',
          url: directive.url,
          label:
            directive.title ??
            directive.sandbox ??
            t('components.native-chat.screen.defaultTitle', 'PC screen'),
          containerName: directive.sandbox
        }
      : { status: 'loading' }
  )

  const refreshScreens = useCallback(async (): Promise<void> => {
    if (directive.url && isLocalScreenUrl(directive.url)) {
      setResolved({
        status: 'ready',
        url: directive.url,
        label:
          directive.title ??
          directive.sandbox ??
          t('components.native-chat.screen.defaultTitle', 'PC screen'),
        containerName: directive.sandbox
      })
      return
    }
    const api = window.api?.runtimeEnvironments?.localSandboxes
    if (!api) {
      setResolved({ status: 'unavailable' })
      return
    }
    setResolved({ status: 'loading' })
    try {
      const screens = api.listScreens
        ? await api.listScreens()
        : (await api.list()).map((entry) => ({
            id: entry.id,
            name: entry.name,
            kind: 'sandbox' as const,
            containerName: entry.containerName,
            status: entry.status,
            screenUrl: entry.screenUrl,
            environmentId: entry.environmentId,
            geometry: entry.geometry
          }))
      setResolved(resolveFromScreens(screens, directive, environmentId))
    } catch {
      setResolved({ status: 'unavailable' })
    }
  }, [directive, environmentId, t])

  useEffect(() => {
    if (directive.url && isLocalScreenUrl(directive.url)) {
      return
    }
    let active = true
    const api = window.api?.runtimeEnvironments?.localSandboxes
    if (!api) {
      setResolved({ status: 'unavailable' })
      return
    }
    const listPromise = api.listScreens
      ? api.listScreens()
      : api.list().then((items) =>
          items.map((entry) => ({
            id: entry.id,
            name: entry.name,
            kind: 'sandbox' as const,
            containerName: entry.containerName,
            status: entry.status,
            screenUrl: entry.screenUrl,
            environmentId: entry.environmentId,
            geometry: entry.geometry
          }))
        )
    void listPromise.then(
      (screens) => {
        if (active) {
          setResolved(resolveFromScreens(screens, directive, environmentId))
        }
      },
      () => {
        if (active) {
          setResolved({ status: 'unavailable' })
        }
      }
    )
    return () => {
      active = false
    }
  }, [directive, environmentId])

  const previewUrl = useMemo(
    () => (resolved.status === 'ready' ? buildPreviewFrameUrl(resolved.url, interactive) : null),
    [interactive, resolved]
  )

  const openInOrca = useCallback((): void => {
    if (resolved.status !== 'ready') {
      return
    }
    openAppHttpLink(resolved.url, { worktreeId: owner.worktreeId, destination: 'orca' })
  }, [owner.worktreeId, resolved])

  const openExternal = useCallback((): void => {
    if (resolved.status !== 'ready') {
      return
    }
    openAppHttpLink(resolved.url, { worktreeId: owner.worktreeId, destination: 'system' })
  }, [owner.worktreeId, resolved])

  const title =
    resolved.status === 'ready'
      ? resolved.label
      : (directive.title ??
        directive.sandbox ??
        t('components.native-chat.screen.defaultTitle', 'PC screen'))

  const openScreenLabel = t('components.native-chat.screen.openScreen', 'Open screen')
  const openExternalLabel = t(
    'components.native-chat.screen.openExternal',
    'Open in external browser'
  )
  const controlHereLabel = t('components.native-chat.screen.controlHere', 'Control here')
  const previewOnlyLabel = t('components.native-chat.screen.previewOnly', 'Preview')
  const clickToOpenLabel = t(
    'components.native-chat.screen.clickToOpen',
    'Click to open and control PC screen'
  )

  return (
    <div className="my-3 min-w-0 max-w-full overflow-hidden rounded-lg border border-chat-code-border bg-chat-code-surface select-none last:mb-0">
      <div className="flex min-h-8 items-center justify-between gap-2 px-3 py-1">
        <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-foreground">
          <Monitor className="size-3.5 shrink-0 text-chat-foreground-faint" />
          {resolved.status === 'ready' ? (
            <span className="size-1.5 shrink-0 rounded-full bg-status-success" aria-hidden="true" />
          ) : null}
          <span className="truncate">{title}</span>
        </span>
        {resolved.status === 'ready' ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setInteractive((value) => !value)}
            >
              {interactive ? <Eye className="size-3" /> : <MousePointerClick className="size-3" />}
              {interactive ? previewOnlyLabel : controlHereLabel}
            </Button>
            <Button type="button" variant="secondary" size="xs" onClick={openInOrca}>
              <Maximize2 className="size-3" />
              {openScreenLabel}
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={openExternalLabel}
                  onClick={openExternal}
                >
                  <ExternalLink className="size-3" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {openExternalLabel}
              </TooltipContent>
            </Tooltip>
          </div>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => {
              setReloadNonce((n) => n + 1)
              void refreshScreens()
            }}
          >
            <RefreshCw className="size-3" />
            {t('components.native-chat.screen.retry', 'Retry')}
          </Button>
        )}
      </div>

      {directive.reason ? (
        <div className="border-t border-chat-code-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
          {directive.reason}
        </div>
      ) : null}

      <div className="relative border-t border-chat-code-border bg-black/90">
        {resolved.status === 'ready' && previewUrl ? (
          <div className="relative aspect-video w-full max-h-[320px] overflow-hidden">
            <iframe
              key={`${previewUrl}:${String(reloadNonce)}`}
              src={previewUrl}
              title={title}
              className="h-full w-full border-0"
              style={dragPassthrough || !interactive ? { pointerEvents: 'none' } : undefined}
              referrerPolicy="no-referrer"
            />
            {!interactive ? (
              <button
                type="button"
                aria-label={clickToOpenLabel}
                onClick={openInOrca}
                className="group absolute inset-0 flex cursor-pointer items-end justify-center bg-transparent p-3 transition-colors hover:bg-black/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/75 px-3 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-xs transition-transform group-hover:scale-[1.02]">
                  <Maximize2 className="size-3" />
                  {clickToOpenLabel}
                </span>
              </button>
            ) : null}
          </div>
        ) : resolved.status === 'loading' ? (
          <div className="flex h-32 items-center justify-center px-3 text-xs text-chat-foreground-faint">
            {t('components.native-chat.screen.loading', 'Connecting to PC screen…')}
          </div>
        ) : (
          <div className="flex h-28 flex-col items-center justify-center gap-1.5 px-4 text-center text-xs text-chat-foreground-faint">
            <span>
              {t(
                'components.native-chat.screen.unavailable',
                'No running local PC screen found. Start pczinho or a local sandbox and retry.'
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
