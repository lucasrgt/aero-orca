import React from 'react'
import { cn } from '@/lib/class-names'

type GlyphProps = Omit<React.ComponentProps<'svg'>, 'children'>

/** Solid emerald circle with a crisp transparent checkmark cutout. */
export function DoneIcon({ className, ...props }: GlyphProps): React.JSX.Element {
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

/** Solid destructive circle with a crisp transparent X cutout. */
export function FailedIcon({ className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 text-destructive', className)}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm2.6 4.4a.85.85 0 0 1 0 1.2L9.2 8l1.4 1.4a.85.85 0 1 1-1.2 1.2L8 9.2l-1.4 1.4a.85.85 0 1 1-1.2-1.2L6.8 8 5.4 6.6a.85.85 0 0 1 1.2-1.2L8 6.8l1.4-1.4a.85.85 0 0 1 1.2 0Z"
      />
    </svg>
  )
}

/** Solid muted circle with a crisp transparent stop-square cutout. */
export function StoppedIcon({ className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 text-muted-foreground', className)}
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        fill="currentColor"
        d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1ZM6.2 5.4h3.6a.8.8 0 0 1 .8.8v3.6a.8.8 0 0 1-.8.8H6.2a.8.8 0 0 1-.8-.8V6.2a.8.8 0 0 1 .8-.8Z"
      />
    </svg>
  )
}

/** Clean hollow ring for idle/pending states. */
export function IdleIcon({ className, ...props }: GlyphProps): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 text-muted-foreground/45', className)}
      {...props}
    >
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  )
}
