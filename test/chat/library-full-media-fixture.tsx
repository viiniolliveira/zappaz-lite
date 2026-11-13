import type { AxiosAdapter } from 'axios'
import { createRoot } from 'react-dom/client'
import LibraryMediaTile from '../../src/components/chat/library-media-tile.tsx'
import { api } from '../../src/lib/api-client.ts'
import { mockConversations, mockSessionId } from './mock-data.ts'

const source = mockConversations[0].messages.find((item) => item.type === 'image')
if (!source?.media?.thumbnail) throw Error('Image fixture missing')
const imageMessage = source
const media = source.media
const thumbnail = media.thumbnail
const info = {
  id: mockConversations[0].id,
  sessionId: mockSessionId,
  displayName: 'Pessoa',
  avatarUrl: null,
}
const videoBase64 =
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAAIpEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTbuMU6uEElTDZ1OsggEeTbuMU6uEHFO7a1OsggIT7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjAuMTYuMTAwV0GNTGF2ZjYwLjE2LjEwMESJiEBUAAAAAAAAFlSua8GuAQAAAAAAADjXgQFzxYjI13oQE9CeEpyBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAJiWgDgibCBELqBEJqBAhJUw2f8c3OgY8CAZ8iaRaOHRU5DT0RFUkSHjUxhdmY2MC4xNi4xMDBzc9ZjwItjxYjI13oQE9CeEmfIoUWjh0VOQ09ERVJEh5RMYXZjNjAuMzEuMTAyIGxpYnZweGfIoUWjiERVUkFUSU9ORIeTMDA6MDA6MDAuMDgwMDAwMDAwAB9DtnXv54EAo72BAACA8AIAnQEqEAAQAABHCIWFiJmEiAICAnWqA/gD+gINTe4A/v1u8//kb+PnRv/I4//8Sp7jieP//EaAo6uBACgAsQEABRCsABgAMD/0DADvAP7tTd/GmPPwPQDvf/W/kv7fyX9wH8rAHFO7a5G7j7OBALeK94EB8YIBn/CBAw=='
const bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
const imageBlob = new Blob([bytes(thumbnail.base64)], { type: thumbnail.mimeType })
const videoBlob = new Blob([bytes(videoBase64)], { type: 'video/webm' })
const calls: string[] = []
const revoked: string[] = []
const originalRevoke = URL.revokeObjectURL.bind(URL)
URL.revokeObjectURL = (url) => {
  revoked.push(url)
  originalRevoke(url)
}
let recover = false
let aborted = false
let playCalls = 0
const originalPlay = HTMLMediaElement.prototype.play
HTMLMediaElement.prototype.play = function () {
  playCalls++
  return originalPlay.call(this)
}
api.defaults.adapter = ((config) => {
  const id = (config.url ?? '').split('/').at(-2) ?? ''
  calls.push(id)
  if (id === 'pending')
    return new Promise((_resolve, reject) => {
      config.signal?.addEventListener('abort', () => {
        aborted = true
        reject(Error('aborted'))
      })
    })
  if (id === 'download-error' && !recover) return Promise.reject(Error('download failed'))
  const data =
    id === 'decode-error' && !recover
      ? new Blob(['invalid'], { type: 'image/jpeg' })
      : id.startsWith('video')
        ? videoBlob
        : imageBlob
  return Promise.resolve({ config, data, status: 200, statusText: 'OK', headers: {} })
}) satisfies AxiosAdapter
const rootElement = document.getElementById('root')
if (!rootElement) throw Error('Missing root')
const root = createRoot(rootElement)
let opened: Blob | null | undefined
function entry(id: string, kind: 'image' | 'video', withThumbnail: boolean) {
  return {
    conversation: info,
    message: {
      ...imageMessage,
      id,
      media: {
        ...media,
        id,
        kind,
        thumbnail: withThumbnail ? thumbnail : null,
        fileName: null,
        contentPath: media.contentPath.replace(media.id, id),
      },
    },
  }
}
function mount(id: string, kind: 'image' | 'video', withThumbnail: boolean, top = 0) {
  opened = undefined
  root.render(
    <div style={{ position: 'absolute', top, width: 100, height: 100 }}>
      <LibraryMediaTile
        key={id}
        entry={entry(id, kind, withThumbnail)}
        disabled={false}
        loadFullMedia
        onOpen={(_entry, _trigger, blob) => {
          opened = blob
        }}
      />
    </div>,
  )
}
function assert(condition: unknown, message: string) {
  if (!condition) throw Error(message)
}
async function wait(condition: () => boolean, message: string) {
  for (let i = 0; i < 300; i++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw Error(`Timeout: ${message}; calls=${calls.join(',')}; html=${rootElement?.innerHTML}`)
}
function tile() {
  const button = rootElement?.querySelector<HTMLButtonElement>('button[aria-label^="Abrir "]')
  if (!button) throw Error('Tile missing')
  return button
}
async function run() {
  for (const [id, kind, thumb] of [
    ['image-thumb', 'image', true],
    ['image-none', 'image', false],
    ['video-thumb', 'video', true],
    ['video-none', 'video', false],
  ] as const) {
    mount(id, kind, thumb)
    await wait(() => calls.includes(id), `${id} requested`)
    if (kind === 'image')
      await wait(
        () => !!tile().querySelector<HTMLImageElement>('img[src^="blob:"]')?.naturalWidth,
        `${id} decoded`,
      )
    else {
      await wait(() => (tile().querySelector('video')?.readyState ?? 0) >= 2, `${id} first frame`)
      const video = tile().querySelector('video')
      if (!video) throw Error(`${id} video missing`)
      assert(
        video.paused && video.muted && !video.autoplay,
        `${id} must be muted and paused without autoplay`,
      )
    }
    await wait(() => tile().getAttribute('aria-busy') === 'false', `${id} ready`)
    tile().click()
    assert(
      opened === (kind === 'image' ? imageBlob : videoBlob),
      `${id} callback must reuse decoded blob`,
    )
    assert(playCalls === 0, 'Media started playing automatically')
  }
  mount('offscreen', 'image', false, 3000)
  await wait(
    () => tile().getAttribute('aria-label')?.includes('offscreen') ?? false,
    'offscreen rendered',
  )
  await new Promise((resolve) => setTimeout(resolve, 200))
  assert(!calls.includes('offscreen'), 'Offscreen tile requested media')
  tile().scrollIntoView()
  await wait(() => calls.includes('offscreen'), 'offscreen requested after scroll')
  await wait(
    () => !!tile().querySelector<HTMLImageElement>('img[src^="blob:"]')?.naturalWidth,
    'offscreen decoded',
  )
  window.scrollTo(0, 0)
  for (const id of ['download-error', 'decode-error']) {
    recover = false
    mount(id, 'image', true)
    await wait(() => calls.includes(id), `${id} requested`)
    await wait(() => !!rootElement?.querySelector('[role="alert"]'), `${id} error`)
    assert(!!tile().querySelector('img[src^="data:"]'), `${id} must retain thumbnail`)
    tile().click()
    assert(opened === null, `${id} callback must not pass failed blob`)
    recover = true
    const retry = [...document.querySelectorAll('button')].find((button) =>
      /tentar.*novamente/i.test(
        `${button.textContent ?? ''} ${button.getAttribute('aria-label') ?? ''}`,
      ),
    )
    if (!retry) throw Error(`${id} retry missing`)
    retry.click()
    await wait(() => calls.filter((value) => value === id).length === 2, `${id} retried`)
    await wait(
      () => !!tile().querySelector<HTMLImageElement>('img[src^="blob:"]')?.naturalWidth,
      `${id} recovered`,
    )
    await wait(() => tile().getAttribute('aria-busy') === 'false', `${id} ready after retry`)
    tile().click()
    assert(opened === imageBlob, `${id} recovered blob missing`)
  }
  const currentUrl = tile().querySelector<HTMLImageElement>('img[src^="blob:"]')?.src
  root.render(null)
  await wait(() => !!currentUrl && revoked.includes(currentUrl), 'blob URL revoked on unmount')
  mount('pending', 'image', false)
  await wait(() => calls.includes('pending'), 'pending request started')
  root.render(null)
  await wait(() => aborted, 'pending request aborted on unmount')
  root.unmount()
  document.body.textContent = 'ok'
}
run().catch((error) => {
  document.body.textContent = `FAIL: ${String(error)}`
})
