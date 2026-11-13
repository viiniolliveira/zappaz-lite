import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import MediaGallery from '../../src/components/chat/media-gallery'
import MediaGalleryPreview from '../../src/components/chat/media-gallery-preview'
import MessageHistory from '../../src/components/chat/message-history'
import { useChatMedia } from '../../src/hooks/use-chat-media'
import { api } from '../../src/lib/api-client'
import { getChatMediaMessages } from '../../src/lib/chat/media-library'
import type { MediaDTO } from '../../src/lib/chat/schemas'
import { mockConversations, mockMessage, mockSessionId } from './mock-data'

const conversation = {
  ...mockConversations[0],
  messages: mockConversations[0].messages.map((message) =>
    message.type === 'document' && message.media
      ? { ...message, media: { ...message.media, mimeType: 'text/plain', fileName: 'exemplo.txt' } }
      : message,
  ),
}
const media = getChatMediaMessages(conversation.messages, mockSessionId, conversation.id)
const older = mockMessage(999, conversation.id, {
  type: 'image',
  text: 'Anterior',
  orderAt: '2025-01-01T00:00:00.000Z',
  media: { ...media[0].media, id: '00000000-0000-4000-8000-000000000999' },
})
function Fixture() {
  const [messages, setMessages] = useState(conversation.messages)
  const [other, setOther] = useState(false)
  return (
    <>
      <button type="button" id="switch" onClick={() => setOther(true)}>
        Trocar
      </button>
      <MessageHistory
        key={other ? 'other' : conversation.id}
        conversationId={other ? 'other' : conversation.id}
        displayName="Contato"
        messages={other ? [] : messages}
        hasOlder
        onLoadOlder={async () => {
          setMessages((current) => [older, ...current])
        }}
      />
    </>
  )
}
const wait = async (condition: () => boolean, label: string) => {
  for (let i = 0; i < 150; i++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`Timeout: ${label}; ${document.body.innerText}`)
}
function button(label: string): HTMLButtonElement {
  const item = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  if (!item) throw new Error(`Missing button: ${label}`)
  return item
}
function element<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) throw Error(`Missing ${selector}`)
  return found
}
function check(value: unknown, message: string) {
  if (!value) throw new Error(message)
}
const snapshots: Record<string, ReturnType<typeof useChatMedia>> = {}
let staleResult = false
function MediaProbe({ name, item, blob }: { name: string; item: MediaDTO; blob: Blob }) {
  const result = useChatMedia(item, true, blob)
  if (result.blob && result.blob !== blob) staleResult = true
  snapshots[name] = result
  return (
    <div
      ref={result.elementRef}
      style={{ position: 'fixed', top: 0, left: 0, width: 10, height: 10 }}
    />
  )
}
async function run() {
  let requests = 0
  window.fetch = () => Promise.reject(new Error('Unexpected network request'))
  api.defaults.adapter = async (config) => {
    requests++
    if (config.url?.endsWith('/media')) {
      const second = !!config.params.cursor
      return {
        config,
        data: {
          status: 'success',
          data: (second ? [older] : media).map((message) => ({ ...message.media, message })),
          count: 5,
          page: { hasMore: !second, nextCursor: second ? null : 'next' },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
      }
    }
    return {
      config,
      data: new Blob(['fixture'], { type: 'application/octet-stream' }),
      status: 200,
      statusText: 'OK',
      headers: {},
    }
  }
  const root = createRoot(element<HTMLElement>('#root'))
  root.render(<Fixture />)
  await wait(() => !!document.querySelector('[aria-label="Abrir vídeo na galeria"]'), 'history')
  const trigger = button('Abrir vídeo na galeria')
  trigger.focus()
  trigger.click()
  await wait(() => !!document.querySelector('[aria-label="Abrir vídeo 2"]'), 'gallery')
  const status = () =>
    document.querySelector('[data-slot="media-gallery"] header [role="status"]')?.textContent
  check(status() === '5 mídias', 'opening must select video')
  check(
    !!document.querySelector('[aria-current="true"][aria-label="Abrir vídeo 2"]'),
    'selected thumbnail',
  )
  button('Abrir documento 4').click()
  await wait(
    () => !!document.querySelector('[aria-current="true"][aria-label="Abrir documento 4"]'),
    'document',
  )
  await wait(
    () => !!document.body.textContent?.includes('Baixe o arquivo para abrir'),
    'document download card',
  )
  button('Carregar mídias anteriores').click()
  await wait(
    () => !!document.querySelector('[aria-current="true"][aria-label="Abrir documento 5"]'),
    'prepend preserves selection',
  )
  check(
    !!document.querySelector('[aria-current="true"][aria-label="Abrir documento 5"]'),
    'document selected after prepend',
  )
  button('Mídia anterior').click()
  await wait(
    () => !!document.querySelector('[aria-current="true"][aria-label="Abrir áudio 4"]'),
    'previous arrow',
  )
  await wait(() => !!document.querySelector('[data-slot="message-audio"]'), 'audio player')
  element<HTMLElement>('[data-slot="message-audio"]').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
  )
  await new Promise((resolve) => setTimeout(resolve, 100))
  check(
    !!document.querySelector('[aria-current="true"][aria-label="Abrir áudio 4"]'),
    'audio player arrows must not navigate gallery',
  )
  button('Próxima mídia').click()
  await wait(
    () => !!document.querySelector('[aria-current="true"][aria-label="Abrir documento 5"]'),
    'next arrow',
  )
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await wait(() => !document.querySelector('[data-slot="media-gallery"]'), 'escape')
  await wait(() => document.activeElement === trigger, 'restore focus')
  trigger.click()
  await wait(() => !!document.querySelector('[data-slot="media-gallery"]'), 'reopen')
  element<HTMLElement>('#switch').click()
  await wait(() => !document.querySelector('[data-slot="media-gallery"]'), 'conversation switch')
  // Documents that are not routed to the PDF viewer remain download-only.
  const doc = media[3]
  root.render(
    <MediaGalleryPreview
      message={doc}
      url="blob:local"
      state="ready"
      elementRef={{ current: null }}
      onRetry={() => {}}
    />,
  )
  await wait(() => !!document.body.textContent?.includes('Baixe o arquivo'), 'document card')
  check(!document.querySelector('iframe'), 'documents must not use an iframe')
  const requestsBeforeProbes = requests
  const firstBlob = new Blob(['first'], { type: 'image/jpeg' })
  const secondBlob = new Blob(['second'], { type: 'video/mp4' })
  const probes = (item: MediaDTO, blob: Blob) => (
    <>
      <MediaProbe name="first" item={item} blob={blob} />
      <MediaProbe name="second" item={media[0].media} blob={firstBlob} />
    </>
  )
  root.render(probes(media[0].media, firstBlob))
  await wait(() => !!snapshots.first && !!snapshots.second, 'mount blob probes')
  snapshots.first.retry()
  snapshots.second.retry()
  await wait(
    () => snapshots.first?.state === 'ready' && snapshots.second?.state === 'ready',
    'blob reuse',
  )
  check(
    snapshots.first.blob === firstBlob && snapshots.first.url !== snapshots.second.url,
    'independent object URLs',
  )
  const oldUrl = snapshots.first.url
  root.render(probes(media[1].media, secondBlob))
  await wait(
    () => snapshots.first?.blob === secondBlob && snapshots.first.state === 'ready',
    'new media blob',
  )
  check(snapshots.first.url !== oldUrl, 'new media must not reuse old URL')
  check(!staleResult, 'old blob was exposed while changing media')
  check(requests === requestsBeforeProbes, 'provided blobs must not trigger downloads')
  root.render(
    <MediaGallery
      messages={conversation.messages}
      sessionId={mockSessionId}
      conversationId={conversation.id}
      displayName="Contato"
      initialMessageId={media[1].id}
      initialBlob={new Blob(['x'], { type: 'video/mp4' })}
      onClose={() => {}}
      onRestoreFocus={() => {}}
    />,
  )
  await wait(
    () => !!document.querySelector('[data-slot="video-player-pro"]'),
    'gallery video player',
  )
  const galleryStatus = () =>
    document.querySelector('[data-slot="media-gallery"] header [role="status"]')?.textContent
  check(galleryStatus() === '5 mídias', 'video selection')
  const player = element<HTMLElement>('[data-slot="video-player-pro"]')
  player.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await new Promise((resolve) => setTimeout(resolve, 100))
  check(
    galleryStatus() === '5 mídias',
    `player arrows must not navigate gallery: ${galleryStatus()}`,
  )
  element<HTMLElement>('[data-slot="media-gallery"]').dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
  )
  await wait(
    () => !!document.querySelector('[aria-current="true"][aria-label="Abrir áudio 4"]'),
    'gallery arrow outside player',
  )
  root.unmount()
  check(requests > 0, 'gallery must request selected media')
  document.body.textContent = 'ok'
}
run().catch((error) => {
  document.body.textContent = `FAIL: ${String(error)}`
})
