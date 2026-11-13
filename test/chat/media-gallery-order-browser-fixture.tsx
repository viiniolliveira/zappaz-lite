import { createRoot } from 'react-dom/client'
import MediaGallery from '../../src/components/chat/media-gallery.tsx'
import { api } from '../../src/lib/api-client.ts'
import { getChatMediaMessages } from '../../src/lib/chat/media-library.ts'
import { mockConversations, mockMessage, mockSessionId } from './mock-data.ts'

const conversation = mockConversations[0]
const template = getChatMediaMessages(conversation.messages, mockSessionId, conversation.id)[0]
const thumbnail = template.media.thumbnail
if (!thumbnail) throw new Error('Missing thumbnail fixture')
const messages = [1, 2, 3, 4, 5].map((n) =>
  mockMessage(700 + n, conversation.id, {
    type: 'image',
    text: `Foto ${n}`,
    orderAt: `2025-01-0${n}T00:00:00.000Z`,
    sentAt: `2025-01-0${6 - n}T00:00:00.000Z`,
    media: {
      ...template.media,
      id: `00000000-0000-4000-8000-${String(800 + n).padStart(12, '0')}`,
      thumbnail: {
        mimeType: 'image/jpeg',
        base64: btoa(atob(thumbnail.base64) + String.fromCharCode(n)),
        width: 80,
        height: 60,
      },
    },
  }),
)
const required = <T,>(value: T | null | undefined): T => {
  if (value == null) throw new Error('Required fixture element missing')
  return value
}
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
const wait = async (condition: () => unknown, label: string) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`timeout: ${label}`)
}
const thumbnails = () => [
  ...document.querySelectorAll<HTMLButtonElement>(
    '[aria-label="Miniaturas da conversa"] button[aria-label^="Abrir imagem"]',
  ),
]
const selected = () =>
  thumbnails().findIndex((button) => button.getAttribute('aria-current') === 'true') + 1
const caption = () =>
  document.querySelector('[data-slot="media-gallery"] footer')?.previousElementSibling?.textContent
const verifyOrder = (count: number, offset = 0) => {
  const buttons = thumbnails()
  check(buttons.length === count, `expected ${count} thumbnails, got ${buttons.length}`)
  buttons.forEach((button, index) => {
    check(
      button.querySelector('img')?.getAttribute('src') ===
        `data:image/jpeg;base64,${messages[index + offset].media?.thumbnail?.base64}`,
      `thumbnail ${index + 1} out of order`,
    )
  })
}
async function run() {
  window.fetch = () => Promise.reject(new Error('unexpected network'))
  let finish: (() => void) | undefined
  api.defaults.adapter = async (config) => {
    if (!config.url?.endsWith('/media')) throw new Error(`unexpected request ${config.url}`)
    if (!config.params.cursor)
      return {
        config,
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {
          status: 'success',
          data: [messages[4], messages[3], messages[2]].map((message) => ({
            ...message.media,
            message,
          })),
          count: 5,
          page: { hasMore: true, nextCursor: 'next' },
        },
      }
    check(config.params.cursor === 'next', 'unexpected cursor')
    return await new Promise((resolve) => {
      finish = () =>
        resolve({
          config,
          status: 200,
          statusText: 'OK',
          headers: {},
          data: {
            status: 'success',
            data: [messages[1], messages[0]].map((message) => ({ ...message.media, message })),
            count: 5,
            page: { hasMore: false, nextCursor: null },
          },
        })
    })
  }
  const root = createRoot(required(document.getElementById('root')))
  root.render(
    <MediaGallery
      messages={[messages[4], messages[2], messages[0], messages[3], messages[1]]}
      sessionId={mockSessionId}
      conversationId={conversation.id}
      displayName="Contato"
      initialMessageId={messages[4].id}
      initialBlob={null}
      onClose={() => {}}
      onRestoreFocus={() => {}}
    />,
  )
  await wait(
    () =>
      thumbnails().length === 3 &&
      !!document.querySelector('button[aria-label="Carregar mídias anteriores"]'),
    'first page',
  )
  verifyOrder(3, 2)
  check(selected() === 3 && caption() === 'Foto 5', 'clicked latest selection not preserved')
  const dialog = required(document.querySelector<HTMLElement>('[data-slot="media-gallery"]'))
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  await wait(() => selected() === 2 && caption() === 'Foto 4', 'left selects older')
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await wait(() => selected() === 3 && caption() === 'Foto 5', 'right selects newer')
  required(document.querySelector<HTMLButtonElement>('button[aria-label="Mídia anterior"]')).click()
  await wait(() => selected() === 2 && caption() === 'Foto 4', 'previous button selects older')
  required(document.querySelector<HTMLButtonElement>('button[aria-label="Próxima mídia"]')).click()
  await wait(() => selected() === 3 && caption() === 'Foto 5', 'next button selects newer')
  thumbnails()[1].click()
  await wait(() => selected() === 2 && caption() === 'Foto 4', 'thumbnail selects middle')
  required(
    document.querySelector<HTMLButtonElement>('button[aria-label="Carregar mídias anteriores"]'),
  ).click()
  await wait(() => !!finish, 'page request')
  check(selected() === 2 && caption() === 'Foto 4', 'selection changed while loading')
  required(finish)()
  await wait(() => thumbnails().length === 5, 'next page')
  verifyOrder(5)
  await wait(
    () => selected() === 4 && caption() === 'Foto 4',
    `selection after page (selected=${selected()}, caption=${caption()})`,
  )
  await new Promise((resolve) => setTimeout(resolve, 150))
  check(
    selected() === 4 && caption() === 'Foto 4',
    'selection changed after carousel reinitialization',
  )
  dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
  await wait(() => selected() === 5 && caption() === 'Foto 5', 'navigation after pagination')
  root.unmount()
  document.body.textContent = 'ok'
}
run().catch((error) => {
  document.body.textContent = `FAIL: ${String(error)}`
})
