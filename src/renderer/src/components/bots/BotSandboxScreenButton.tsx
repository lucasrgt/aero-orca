import { useEffect, useState } from 'react'
import { Monitor } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { openAppHttpLink } from '@/lib/browser/navigation/app-http-link-open'
import {
  parseExecutionHostId,
  type ExecutionHostId
} from '../../../../shared/execution-host/execution-host'

/** Shows a quick Open screen button when a bot runs on a local Docker sandbox. */
export function BotSandboxScreenButton({
  hostId,
  disabled
}: {
  hostId: ExecutionHostId
  disabled?: boolean
}): React.JSX.Element | null {
  const t = useTranslate()
  const parsed = parseExecutionHostId(hostId)
  const environmentId = parsed?.kind === 'runtime' ? parsed.environmentId : null
  const [screenUrl, setScreenUrl] = useState<string | null>(null)

  useEffect(() => {
    const api = window.api?.runtimeEnvironments?.localSandboxes
    if (!api || !environmentId) {
      setScreenUrl(null)
      return
    }
    let active = true
    void api.list().then(
      (sandboxes) => {
        if (!active) {
          return
        }
        const match = sandboxes.find((entry) => entry.environmentId === environmentId)
        setScreenUrl(match ? match.screenUrl : null)
      },
      () => {
        if (active) {
          setScreenUrl(null)
        }
      }
    )
    return () => {
      active = false
    }
  }, [environmentId])

  if (!screenUrl) {
    return null
  }

  const label = t('localSandbox.botHeader.openScreen', 'Open sandbox screen')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={label}
          onClick={() => openAppHttpLink(screenUrl)}
        >
          <Monitor />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
