const extensions: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif', 'image/heic': 'heic', 'image/heif': 'heif' }

/** Fetch the original only when asked. Hosts that deny cross-origin reads need the original-link fallback. */
export async function imageFile(url: string, number: number, signal: AbortSignal): Promise<File> {
  const response = await fetch(url, { credentials: 'omit', signal })
  if (!response.ok) throw new Error('Image unavailable')
  const blob = await response.blob()
  const extension = extensions[blob.type.toLowerCase()]
  if (!extension || !blob.size) throw new Error('Image cannot be downloaded here')
  return new File([blob], `paperwing-image-${number}.${extension}`, { type: blob.type })
}

export function saveImage(file: File) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  document.body.append(link)
  link.click()
  link.remove()
  // Safari may start the download after the click task completes.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
