import React from 'react'
import { cn } from '@/lib/class-names'
import { observeOffscreenAnimation } from '@/lib/window-activity/offscreen-animation-pause'

const PIXEL_SPINNER_ANIMATION_NAME = 'pixel-spinner-trail'
const PIXEL_CELLS = [0, 1, 2, 3, 4, 5, 6, 7] as const

// Offscreen spinners drop their animation; reveal re-anchors phase via animationstart.
function observeSpinner(el: HTMLSpanElement): () => void {
  return observeOffscreenAnimation(el)
}

// Keep every visible pixel spinner stepping on the same clock without recurring JS work.
function handlePixelSpinnerAnimationStart(event: React.AnimationEvent<HTMLSpanElement>): void {
  if (event.animationName !== PIXEL_SPINNER_ANIMATION_NAME) {
    return
  }
  const target = event.target
  if (!(target instanceof HTMLElement) || typeof target.getAnimations !== 'function') {
    return
  }
  const animation = target
    .getAnimations()
    .find(
      (candidate) =>
        'animationName' in candidate && candidate.animationName === PIXEL_SPINNER_ANIMATION_NAME
    )
  if (animation !== undefined) {
    animation.startTime = 0
  }
}

/** 3x3 perimeter pixel-ring spinner with a stepped clockwise trail. */
export function PixelSpinner({
  tone = 'inherit',
  className,
  ...rest
}: Omit<React.ComponentProps<'span'>, 'children'> & {
  tone?: 'inherit' | 'working'
}): React.JSX.Element {
  return (
    <span
      ref={observeSpinner}
      onAnimationStart={handlePixelSpinnerAnimationStart}
      aria-hidden="true"
      className={cn(
        'pixel-spinner relative inline-block shrink-0',
        tone === 'working' && 'text-agent-working',
        className
      )}
      {...rest}
    >
      {PIXEL_CELLS.map((index) => (
        <span key={index} className="pixel-spinner-cell" />
      ))}
    </span>
  )
}
