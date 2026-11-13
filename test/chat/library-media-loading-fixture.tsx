import type { AxiosAdapter } from 'axios'
import { createRoot } from 'react-dom/client'
import LibraryMediaTile from '../../src/components/chat/library-media-tile.tsx'
import { api } from '../../src/lib/api-client.ts'
import { mockConversations, mockSessionId } from './mock-data.ts'

const conversation = mockConversations[0]
const image = conversation.messages.find((message) => message.type === 'image')
if (!image?.media?.thumbnail) throw Error('Image fixture missing')
const media = image.media
const thumbnail = media.thumbnail
const info = {
  id: conversation.id,
  sessionId: mockSessionId,
  displayName: 'Pessoa da conversa',
  avatarUrl: null,
}
const cases = [
  { id: 'image', kind: 'image' as const, thumbnail, duration: null },
  { id: 'video', kind: 'video' as const, thumbnail, duration: 65 },
  { id: 'audio', kind: 'audio' as const, thumbnail: null, duration: 12 },
  { id: 'missing', kind: 'image' as const, thumbnail: null, duration: null },
  {
    id: 'invalid',
    kind: 'video' as const,
    thumbnail: { mimeType: 'image/png', base64: 'aW52YWxpZA==' },
    duration: null,
  },
  { id: 'disabled', kind: 'image' as const, thumbnail, duration: null },
  { id: 'offscreen', kind: 'image' as const, thumbnail, duration: null },
]
const entries = cases.map((item) => ({
  conversation: info,
  message: {
    ...image,
    id: item.id,
    media: {
      ...media,
      id: item.id,
      kind: item.kind,
      thumbnail: item.thumbnail,
      duration: item.duration,
      fileName: null,
      contentPath: `/api/media/${item.id}/content`,
    },
  },
}))
const requests: string[] = []
api.defaults.adapter = ((config) => {
  requests.push(`${config.method} ${config.url}`)
  return Promise.reject(Error('Unexpected media request'))
}) satisfies AxiosAdapter
const originalFetch = window.fetch
window.fetch = (...args) => {
  requests.push(`fetch ${String(args[0])}`)
  return originalFetch(...args)
}
const rootElement = document.getElementById('root')
if (!rootElement) throw Error('Root missing')
const root = createRoot(rootElement)
const opened: { entry: (typeof entries)[number]; trigger: HTMLButtonElement; blob: Blob | null }[] =
  []
root.render(
  <div>
    {entries.map((entry) => (
      <div
        key={entry.message.id}
        style={{
          width: 100,
          height: 100,
          position: entry.message.id === 'offscreen' ? 'absolute' : 'relative',
          top: entry.message.id === 'offscreen' ? 2000 : 0,
        }}
      >
        <LibraryMediaTile
          entry={entry}
          disabled={entry.message.id === 'disabled'}
          showSender={entry.message.id === 'video'}
          onOpen={(selected, trigger, blob) => opened.push({ entry: selected, trigger, blob })}
        />
      </div>
    ))}
  </div>,
)
function assert(condition: unknown, message: string) {
  if (!condition) throw Error(message)
}
async function wait(condition: () => boolean, message: string) {
  for (let index = 0; index < 300; index++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw Error(`Timeout: ${message}; requests=${requests.join(',')}`)
}
function button(label: string) {
  const element = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!element) throw Error(`Missing tile: ${label}`)
  return element
}
async function run() {
  await wait(() => !!document.querySelector('button[aria-label="Abrir imagem: image"]'), 'render')
  const imageButton = button('Abrir imagem: image')
  const videoButton = button('Abrir vídeo: video')
  const audioButton = button('Ouvir áudio: audio')
  const missingButton = button('Abrir imagem: missing')
  const invalidButton = button('Abrir vídeo: invalid')
  const disabledButton = button('Abrir imagem: disabled')
  const offscreenButton = button('Abrir imagem: offscreen')
  for (const tile of [imageButton, videoButton]) {
    const preview = tile.querySelector('img')
    assert(
      preview?.getAttribute('src') === `data:${thumbnail.mimeType};base64,${thumbnail.base64}`,
      'Expected exact base64 thumbnail',
    )
    await wait(() => !!preview?.complete && preview.naturalWidth > 0, 'thumbnail decoded')
  }
  await wait(() => !invalidButton.querySelector('img'), 'invalid thumbnail fallback')
  assert(
    !!invalidButton.querySelector('.lucide-video'),
    'Invalid video thumbnail must show video icon',
  )
  assert(
    !!missingButton.querySelector('.lucide-images'),
    'Missing image thumbnail must show image icon',
  )
  assert(
    !!audioButton.querySelector('.lucide-headphones'),
    'Missing audio thumbnail must show audio icon',
  )
  assert(videoButton.textContent?.includes('1:05'), 'Video duration missing')
  assert(audioButton.textContent?.includes('0:12'), 'Audio duration missing')
  assert(videoButton.textContent?.includes(info.displayName), 'Sender missing')
  assert(!imageButton.textContent?.includes(info.displayName), 'Sender shown without showSender')
  assert(disabledButton.disabled, 'Disabled tile is enabled')
  assert(
    !document.querySelector('video, [data-slot="skeleton"], [role="status"], [role="alert"]'),
    'Unexpected full media or loading UI',
  )
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert(requests.length === 0, `Media requested on mount: ${requests.join(',')}`)
  offscreenButton.scrollIntoView()
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert(requests.length === 0, `Media requested on scroll: ${requests.join(',')}`)
  for (const tile of [
    imageButton,
    videoButton,
    audioButton,
    missingButton,
    invalidButton,
    offscreenButton,
  ])
    tile.click()
  disabledButton.click()
  assert(opened.length === 6, 'Expected one callback per enabled tile and none for disabled')
  const clicked = [
    imageButton,
    videoButton,
    audioButton,
    missingButton,
    invalidButton,
    offscreenButton,
  ]
  const selectedEntries = [entries[0], entries[1], entries[2], entries[3], entries[4], entries[6]]
  for (let index = 0; index < clicked.length; index++) {
    assert(opened[index].entry === selectedEntries[index], 'Callback received wrong entry')
    assert(opened[index].trigger === clicked[index], 'Callback received wrong trigger')
    assert(opened[index].blob === null, 'Callback must receive null blob')
  }
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert(requests.length === 0, `Media requested on click: ${requests.join(',')}`)
  root.unmount()
  document.body.textContent = 'ok'
}
run().catch((error) => {
  document.body.textContent = `FAIL: ${String(error)}`
})
