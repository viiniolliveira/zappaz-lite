import { api } from '../../src/lib/api-client'
import { createRoot } from 'react-dom/client'
import MediaGallery from '../../src/components/chat/media-gallery.tsx'
import { getChatMediaMessages } from '../../src/lib/chat/media-library.ts'
import { mockConversations, mockMessage, mockSessionId } from './mock-data.ts'

const conversation = mockConversations[0]
const media = getChatMediaMessages(conversation.messages, mockSessionId, conversation.id)
const older = mockMessage(999, conversation.id, { type: 'image', text: 'Anterior', orderAt: '2025-01-01T00:00:00.000Z', media: { ...media[0].media, id: '00000000-0000-4000-8000-000000000999' } })
const blob = new Blob([Uint8Array.from(atob(media[0].media.thumbnail!.base64), char => char.charCodeAt(0))], { type: 'image/jpeg' })
let finish: (() => void) | undefined
let fail: (() => void) | undefined
let calls = 0
function Fixture() {
  return <MediaGallery messages={conversation.messages} sessionId={mockSessionId} conversationId={conversation.id} displayName="Contato" initialMessageId={media[0].id} initialBlob={blob} onClose={() => {}} onRestoreFocus={() => {}} />
}
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const wait = async (condition: () => unknown, label: string) => {
  for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error(`timeout: ${label}`)
}
const button = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
async function run() {
  window.fetch = () => Promise.reject(new Error('unexpected network'))
  api.defaults.adapter = async config => {
    if (!config.url?.endsWith('/media')) throw new Error(`unexpected request ${config.url}`)
    calls++
    check(config.params.kind === 'gallery' && config.params.limit === 24, 'gallery parameters')
    if (!config.params.cursor) return { config, status: 200, statusText: 'OK', headers: {}, data: { status: 'success', data: media.map(message => ({ ...message.media, message })), count: 4, page: { hasMore: true, nextCursor: 'next' } } }
    check(config.params.cursor === 'next', 'next cursor')
    return await new Promise((resolve, reject) => {
      fail = () => reject(new Error('Falha na página'))
      finish = () => resolve({ config, status: 200, statusText: 'OK', headers: {}, data: { status: 'success', data: [{ ...older.media, message: older }], count: 4, page: { hasMore: false, nextCursor: null } } })
    })
  }
  const root = createRoot(document.getElementById('root')!)
  root.render(<Fixture />)
  await wait(() => !!button('Carregar mídias anteriores') && !!button('Abrir imagem 1'), 'gallery')
  const load = button('Carregar mídias anteriores')!
  const thumb = button('Abrir imagem 1')!
  const bounds = load.getBoundingClientRect()
  const thumbBounds = thumb.getBoundingClientRect()
  const expectedHeight = innerWidth >= 768 ? 80 : 64
  const expectedWidth = innerWidth >= 768 ? 48 : 40
  check(Math.abs(bounds.height - thumbBounds.height) <= 1 && Math.abs(bounds.height - expectedHeight) <= 1 && Math.abs(bounds.width - expectedWidth) <= 1, `button dimensions ${bounds.width}x${bounds.height}, thumbnail ${thumbBounds.height}`)
  check(load.textContent?.trim() === '' && !!load.querySelector('svg[aria-hidden="true"]'), 'button must be icon-only')
  check(load.getAttribute('aria-busy') === 'false' && !load.disabled, 'initial button state')
  document.body.dataset.stage = 'first'
  await wait(() => document.activeElement === load && !!document.querySelector('[role="tooltip"]'), 'tooltip on first Tab focus')
  document.body.dataset.stage = 'leave'
  await wait(() => document.activeElement !== load && !document.querySelector('[role="tooltip"]'), 'tooltip closes on Tab away')
  document.body.dataset.stage = 'hover'
  await wait(() => !!document.querySelector('[role="tooltip"]'), 'tooltip on hover')
  check(document.querySelector('[role="tooltip"]')?.textContent === 'Carregar mídias anteriores', 'tooltip content')
  check(load.getAttribute('aria-describedby') === document.querySelector('[role="tooltip"]')?.id, 'tooltip associated with button')
  document.body.dataset.stage = 'unhover'
  await wait(() => !document.querySelector('[role="tooltip"]'), 'tooltip closes after hover')
  document.body.dataset.stage = 'second'
  await wait(() => document.activeElement === load && !!document.querySelector('[role="tooltip"]'), 'tooltip on Tab after hover')
  document.body.dataset.stage = ''
  load.click()
  await wait(() => !!button('Carregando mídias anteriores'), 'loading label')
  const busy = button('Carregando mídias anteriores')!
  check(calls === 2 && busy.disabled && busy.getAttribute('aria-busy') === 'true', 'loading button state')
  check(!!busy.querySelector('svg[aria-hidden="true"]'), 'loading spinner missing')
  busy.click()
  check(calls === 2, 'disabled button triggered another request')
  check(!!button('Abrir imagem 1')?.hasAttribute('aria-current'), 'selection changed during loading')
  fail!()
  await wait(() => !!document.querySelector('[role="alert"]')?.textContent?.includes('Falha na página'), 'page error')
  check(!!button('Abrir imagem 1')?.hasAttribute('aria-current'), 'selection changed after error')
  await wait(() => !!button('Carregar mídias anteriores'), 'retry button after error')
  button('Carregar mídias anteriores')!.click()
  await wait(() => calls === 3 && !!button('Carregando mídias anteriores'), 'retry page')
  finish!()
  await wait(() => !!button('Abrir imagem 2')?.hasAttribute('aria-current') && !button('Carregar mídias anteriores'), 'selection after prepend')
  check(document.querySelector('[data-slot="media-gallery"] header [role="status"]')?.textContent === '4 mídias', 'selected item changed after prepend')
  root.unmount()
  document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
