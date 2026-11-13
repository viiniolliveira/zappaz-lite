import { RangeNotSatisfiableError } from '../common/errors/range-not-satisfiable-error.ts'

export function mediaResponse(
  file: { bytes: Uint8Array; mimeType: string | null; fileName: string | null },
  range?: string,
) {
  const size = file.bytes.byteLength
  const mediaType = file.mimeType?.split(';')[0]?.trim().toLowerCase() ?? ''
  const safeInline =
    /^(image\/(jpeg|png|gif|webp)|audio\/(mpeg|ogg|mp4|wav|webm)|video\/(mp4|webm|ogg))$/.test(
      mediaType,
    )
  const headers = new Headers({
    'Content-Type': safeInline ? mediaType : 'application/octet-stream',
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Accept-Ranges': 'bytes',
  })
  const fileName = (file.fileName ?? 'media')
    .split('')
    .map((character) =>
      character.charCodeAt(0) < 32 || '"\\/'.includes(character) ? '_' : character,
    )
    .join('')
    .slice(0, 200)
  headers.set(
    'Content-Disposition',
    `${safeInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  )
  let start = 0,
    end = size - 1
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range)
    if (!(match && (match[1] || match[2]))) return invalidRange(size)
    if (match[1]) {
      start = Number(match[1])
      if (match[2]) end = Math.min(end, Number(match[2]))
    } else start = Math.max(0, size - Number(match[2]))
    if (
      !(Number.isSafeInteger(start) && Number.isSafeInteger(end)) ||
      start < 0 ||
      start >= size ||
      end < start ||
      (!match[1] && Number(match[2]) === 0)
    )
      return invalidRange(size)
    headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
  }
  const bytes = file.bytes.slice(start, end + 1)
  headers.set('Content-Length', String(bytes.byteLength))
  return new Response(bytes, { status: range ? 206 : 200, headers })
}
function invalidRange(size: number) {
  throw new RangeNotSatisfiableError(size)
}
