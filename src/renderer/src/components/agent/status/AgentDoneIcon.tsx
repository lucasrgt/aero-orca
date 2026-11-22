import React from 'react'
import { cn } from '@/lib/class-names'

/** Solid success circle with a crisp transparent checkmark cutout for completed agent/task states. */
export function AgentDoneIcon({
  className,
  ...props
}: Omit<React.ComponentProps<'svg'>, 'children'>): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 text-agent-done', className)}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm3.73 5.26-4 4.5a.85.85 0 0 1-1.23.04l-2-2a.85.85 0 0 1 1.2-1.2l1.35 1.35 3.42-3.81a.85.85 0 0 1 1.26 1.12Z"
      />
    </svg>
  )
}
