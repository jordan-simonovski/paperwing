// Pictures for a post, made ready on the device before they're uploaded to the poster's own
// Bluesky account: no bigger than Bluesky takes (a megabyte, 2000px on the longer side), and
// re-encoded, which leaves behind what the camera wrote into the file (where it was taken, the
// device). PaperWing never stores a picture.

/** Bluesky's limit on one picture, with a little room. */
export const MAX_IMAGE_BYTES = 976_000
/** Bluesky shows pictures no bigger than this on the longer side. */
export const MAX_IMAGE_SIDE = 2000
/** Bluesky takes four pictures to a post. */
export const MAX_IMAGES = 4
/** Bluesky's limit on a picture's description. */
export const MAX_ALT = 2000

/** A size that fits within the limit, keeping the picture's shape. */
export function fitWithin(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

/**
 * Encodes at falling quality, then smaller, until it fits under Bluesky's limit. `encode` makes
 * one attempt at a scale (of the fitted size) and a JPEG quality.
 */
export async function shrink(encode: (scale: number, quality: number) => Promise<Blob>): Promise<Blob> {
  for (const scale of [1, 0.85, 0.7, 0.55, 0.4]) {
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      const blob = await encode(scale, quality)
      if (blob.size <= MAX_IMAGE_BYTES) return blob
    }
  }
  throw new Error('That picture is too big to post, even made smaller')
}

export interface PreparedImage {
  blob: Blob
  width: number
  height: number
}

/** A picture from the device, made ready to upload: fitted, re-encoded as JPEG, its metadata left behind. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (!file.type.startsWith('image/')) throw new Error('That isn’t a picture')
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That picture couldn’t be read')
  })
  const fitted = fitWithin(bitmap.width, bitmap.height)
  let size = fitted
  const blob = await shrink(async (scale, quality) => {
    size = { width: Math.max(1, Math.round(fitted.width * scale)), height: Math.max(1, Math.round(fitted.height * scale)) }
    const canvas = document.createElement('canvas')
    canvas.width = size.width
    canvas.height = size.height
    const ctx = canvas.getContext('2d')!
    // JPEG has no transparency: a see-through picture goes on white, not black.
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, size.width, size.height)
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)
    return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('That picture couldn’t be prepared'))), 'image/jpeg', quality))
  }).finally(() => bitmap.close())
  return { blob, ...size }
}
