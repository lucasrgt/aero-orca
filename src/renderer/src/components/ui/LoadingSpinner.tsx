import React from 'react'
import { cn } from '@/lib/class-names'
import { observeOffscreenAnimation } from '@/lib/window-activity/offscreen-animation-pause'
import { handleSpinnerAnimationStart } from '@/components/ui/spinner-phase'
import { PixelSpinner } from '@/components/ui/PixelSpinner'

function observeSpinner(el: HTMLSpanElement): () => void {
  return observeOffscreenAnimation(el)
}

// Rotate this span, not the svg inside: Chromium can't composite an SVG transform animation, so a spinning svg forces a renderer frame every refresh.
export function SpinnerFrame({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <span
      ref={observeSpinner}
      onAnimationStart={handleSpinnerAnimationStart}
      aria-hidden="true"
      className={cn('loading-spinner inline-flex shrink-0', className)}
    >
      {children}
    </span>
  )
}

// Unified 3x3 pixel-ring spinner; falls back to size-3.5 when callers rely on parent SVG sizing (e.g. Button).
export function LoadingSpinner({ className }: { className?: string }): React.JSX.Element {
  const sized = className?.split(/\s+/).some((name) => /(^|:)(size|w|h)-/.test(name)) ?? false
  return <PixelSpinner className={cn(!sized && 'size-3.5', className)} />
}
