import React from 'react'
import { DEFAULT_BOT_AVATAR_COLOR } from '../../../../shared/bots/bot-avatar-color'
import { pictureTintFor } from './avatar-picture-tint'
import type { useNewBotPicture } from './use-new-bot-picture'

/** A soft band of the picture's colour behind the top of the New bot dialog; none for a picture whose
 *  edge is transparent. */
export function NewBotPictureBand({
  picture
}: {
  picture: ReturnType<typeof useNewBotPicture>
}): React.JSX.Element | null {
  // A mascot's band is its tile color; a picture's is its background's, read when it was taken in.
  const band = picture.shownUpload
    ? pictureTintFor(picture.shownUpload)
    : (picture.color ?? DEFAULT_BOT_AVATAR_COLOR)
  const bandStyle: React.CSSProperties & { '--new-bot-band': string } = {
    '--new-bot-band': band ?? DEFAULT_BOT_AVATAR_COLOR
  }
  return band === null ? null : (
    <div
      aria-hidden
      style={bandStyle}
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[84px] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--new-bot-band)_46%,transparent),transparent)] dark:bg-[linear-gradient(180deg,color-mix(in_srgb,var(--new-bot-band)_26%,transparent),transparent)]"
    />
  )
}
