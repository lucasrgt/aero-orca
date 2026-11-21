import React from 'react'
import { PixelSpinner } from '@/components/ui/PixelSpinner'

// Stepped 3x3 pixel-ring spinner in the agent working hue; callers provide size.
export function AgentWorkingSpinner({ className }: { className?: string }): React.JSX.Element {
  return <PixelSpinner tone="working" data-agent-spinner="" className={className} />
}
