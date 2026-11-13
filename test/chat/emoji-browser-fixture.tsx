import { QueryClient } from '@tanstack/react-query'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { chatDraftsAtom } from '../../src/atoms/ui'
import AttachmentWorkspace from '../../src/components/chat/attachment-workspace'
import MessageComposer from '../../src/components/chat/message-composer'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, run: () => Promise<void>) {
  try {
    await run()
    results.push({ name, ok: true })
  } catch (error) {
    results.push({ name, ok: false, error: String(error) })
  }
}
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message)
}
const client = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Infinity } },
})
client.setQueryData(['media', 'limits'], { maxFileSizeBytes: 1024 * 1024, maxFileSizeMb: 1 })
client.setQueryData(['sessions'], { data: [] })
const store = createStore()
store.set(queryClientAtom, client)
store.set(chatDraftsAtom, { first: 'Olá mundo', second: 'outra conversa' })
const root = createRoot(document.body)
let draftKey = 'first'
let disabled = false
async function render() {
  await act(async () => {
    root.render(
      <Provider store={store}>
        <MessageComposer
          draftKey={draftKey}
          disabled={disabled}
          onSend={() => true}
          onAttach={() => true}
        />
      </Provider>,
    )
  })
}
function input() {
  const element =
    document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Legenda do arquivo"]') ??
    document.querySelector<HTMLTextAreaElement>('textarea')
  assert(element, 'missing textarea')
  return element
}
function trigger() {
  const button =
    document.querySelector<HTMLButtonElement>(
      'section[aria-label="Preparar envio de arquivos"] button[aria-label="Selecionar emoji"]',
    ) ?? document.querySelector<HTMLButtonElement>('button[aria-label="Selecionar emoji"]')
  assert(button, 'missing emoji button')
  return button
}
async function open() {
  await act(async () => {
    trigger().click()
    await new Promise((resolve) => setTimeout(resolve, 150))
  })
}
async function choose() {
  const emoji = document.querySelector<HTMLButtonElement>('[data-epr-part="emoji"]')
  assert(emoji, 'missing emoji grid')
  const glyph = emoji.textContent ?? ''
  assert(glyph.length > 0, 'missing native glyph')
  await act(async () => {
    emoji.click()
    await new Promise(requestAnimationFrame)
  })
  return glyph
}
await render()
await check('opens the localized picker and inserts repeatedly at the selection', async () => {
  input().focus()
  input().setSelectionRange(4, 9)
  await open()
  assert(document.querySelector('input[placeholder="Pesquisar emoji"]'), 'missing localized search')
  const first = await choose()
  assert(
    input().value === `Olá ${first}`,
    `selection not replaced: ${JSON.stringify(input().value)} / ${JSON.stringify(first)}`,
  )
  assert(trigger().getAttribute('aria-expanded') === 'true', 'picker closed after selection')
  const second = await choose()
  assert(input().value === `Olá ${first}${second}`, 'successive insertion lost cursor position')
})
await check('Escape closes the picker without submitting the message', async () => {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
  })
  assert(trigger().getAttribute('aria-expanded') === 'false', 'Escape did not close')
  assert(input().value.startsWith('Olá '), 'draft lost')
})
await check('changing conversations closes the picker and preserves each draft', async () => {
  await open()
  draftKey = 'second'
  await render()
  assert(trigger().getAttribute('aria-expanded') === 'false', 'picker followed conversation change')
  assert(input().value === 'outra conversa', 'wrong conversation draft')
})
await check('an emoji exceeding the length limit is rejected without truncation', async () => {
  await act(async () => store.set(chatDraftsAtom, { second: 'a'.repeat(4096) }))
  input().setSelectionRange(4096, 4096)
  await open()
  await choose()
  assert(input().value === 'a'.repeat(4096), 'limit exceeded or text truncated')
  assert(
    document.querySelector('[role="alert"]')?.textContent?.includes('4.096'),
    'missing limit feedback',
  )
})
await check('disabled composer closes the picker and blocks reopening', async () => {
  disabled = true
  await render()
  assert(trigger().disabled, 'emoji button enabled')
  assert(trigger().getAttribute('aria-expanded') === 'false', 'disabled picker left open')
})
await act(async () => root.unmount())

const attachmentRoot = createRoot(document.body)
let resolveSend: ((confirmed: boolean) => void) | undefined
await act(async () => {
  store.set(chatDraftsAtom, { media: 'Legenda inicial' })
  attachmentRoot.render(
    <Provider store={store}>
      <AttachmentWorkspace
        draftKey="media"
        onSend={() =>
          new Promise<boolean>((resolve) => {
            resolveSend = resolve
          })
        }
      >
        <p>Histórico</p>
      </AttachmentWorkspace>
    </Provider>,
  )
})
function attachmentButton(label: string) {
  const button = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  assert(button, `missing ${label}`)
  return button
}
await check('media caption reuses the emoji picker and replaces the selection', async () => {
  const fileInput = document.querySelector<HTMLInputElement>('input[aria-label="Anexar arquivo"]')
  assert(fileInput, 'missing attachment input')
  const transfer = new DataTransfer()
  transfer.items.add(
    new File(['<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>'], 'a.svg', {
      type: 'image/svg+xml',
    }),
  )
  transfer.items.add(new File(['document'], 'b.txt', { type: 'text/plain' }))
  await act(async () => {
    fileInput.files = transfer.files
    fileInput.dispatchEvent(new Event('change', { bubbles: true }))
  })
  assert(input().value === 'Legenda inicial', 'initial caption missing')
  input().focus()
  input().setSelectionRange(0, 7)
  await open()
  const emoji = await choose()
  assert(input().value === `${emoji} inicial`, 'caption selection was not replaced')
  assert(trigger().getAttribute('aria-expanded') === 'true', 'caption picker closed on insertion')
  await choose()
  assert(input().value === `${emoji}${emoji} inicial`, 'repeated caption insertion lost cursor')
})
await check('Escape closes the caption picker without discarding attachments', async () => {
  await act(async () => {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
  })
  assert(trigger().getAttribute('aria-expanded') === 'false', 'caption picker did not close')
  assert(!document.querySelector('[role="dialog"]'), 'discard confirmation opened')
  assert(
    document.querySelector('[aria-label="Preparar envio de arquivos"]'),
    'attachments discarded',
  )
})
await check('switching attachments closes the picker and keeps individual captions', async () => {
  const firstCaption = input().value
  await open()
  await act(async () => attachmentButton('Selecionar arquivo 2: b.txt').click())
  assert(input().value === '', 'caption leaked to second attachment')
  assert(trigger().getAttribute('aria-expanded') === 'false', 'picker followed attachment change')
  await open()
  const emoji = await choose()
  assert(input().value === emoji, 'document caption emoji missing')
  await act(async () => attachmentButton('Selecionar arquivo 1: a.svg').click())
  assert(input().value === firstCaption, 'first caption lost')
})
await check('caption emoji insertion respects the length limit', async () => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      input(),
      'a'.repeat(4096),
    )
    input().dispatchEvent(new Event('input', { bubbles: true }))
  })
  input().setSelectionRange(4096, 4096)
  await open()
  await choose()
  assert(input().value.length === 4096, 'caption exceeded limit')
  assert(
    document.querySelector('[role="alert"]')?.textContent?.includes('legenda'),
    'caption limit feedback missing',
  )
})
await check('sending and unconfirmed media block the caption emoji picker', async () => {
  await act(async () => attachmentButton('Enviar 2 arquivos').click())
  assert(trigger().disabled, 'emoji picker enabled while sending')
  assert(trigger().getAttribute('aria-expanded') === 'false', 'sending left picker open')
  await act(async () => {
    resolveSend?.(false)
  })
  assert(trigger().disabled, 'emoji picker enabled for an unconfirmed attachment')
})
await act(async () => attachmentRoot.unmount())
document.body.textContent = JSON.stringify(results)
