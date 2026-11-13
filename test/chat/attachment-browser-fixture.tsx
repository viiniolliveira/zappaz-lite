import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useAttachmentQueue } from '../../src/components/chat/use-attachment-queue'
import AttachmentWorkspace from '../../src/components/chat/attachment-workspace'
import { createStore, getDefaultStore, Provider } from 'jotai'
import { QueryClient } from '@tanstack/react-query'
import { queryClientAtom } from 'jotai-tanstack-query'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
queryClient.setQueryData(['media', 'limits'], { maxFileSizeBytes: 1024 * 1024, maxFileSizeMb: 1 })
getDefaultStore().set(queryClientAtom, queryClient)

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: String(error) }) }
}
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
const file = (name: string, size = 1) => new File([new Uint8Array(size)], name, { type: 'application/pdf' })
const a = file('a.pdf'), b = file('b.pdf'), edited = file('edited.pdf')
let queue: ReturnType<typeof useAttachmentQueue>
let send: (caption: string, file?: File) => boolean | Promise<boolean> = () => true
let disabled = false
function Harness() { queue = useAttachmentQueue((caption, item) => send(caption, item), disabled); return null }
let root = createRoot(document.body)
await act(async () => root.render(<Harness />))
await check('validation, selection, individual captions, edited and original files', async () => {
  await act(async () => { queue.add([file('empty', 0), a, b, file('large', 1024 * 1024 + 1)], 'first') })
  assert(queue.maxFileSizeBytes === 1024 * 1024 && queue.maxFileSizeMb === 1, 'custom limit not exposed')
  assert(queue.items.length === 2 && !!queue.error, 'invalid files must be rejected and reported')
  assert(queue.items[0].caption === 'first' && queue.items[1].caption === '', 'captions are not individual')
  const id = queue.items[1].id
  await act(async () => { queue.setSelectedId(id); queue.update(id, { caption: 'second', file: edited }) })
  assert(queue.selected?.file === edited && queue.selected.original === b && queue.selected.caption === 'second', 'edited file or original lost')
  await act(async () => queue.update(id, { file: b }))
  assert(queue.selected?.file === b, 'restore original failed')
  await act(async () => queue.remove(queue.items[0].id))
  assert(queue.items.length === 1 && queue.selected?.id === id, 'remove removed wrong item')
  await act(async () => queue.clear())
})
await check('sequential confirmed sends and double submit protection', async () => {
  const calls: string[] = []; let resolve: ((value: boolean) => void) | undefined
  send = (caption, item) => { calls.push(`${item?.name}:${caption}`); return new Promise<boolean>(done => { resolve = done }) }
  await act(async () => { queue.add([a, b], 'hello') })
  let first: Promise<void>; let second: Promise<void>
  await act(async () => { first = queue.send(); second = queue.send(); await Promise.resolve() })
  assert(calls.join() === 'a.pdf:hello' && queue.items.length === 2 && queue.sending, 'first send or lock incorrect')
  await act(async () => { resolve?.(true); await Promise.resolve(); await Promise.resolve() })
  assert(calls.join() === 'a.pdf:hello,b.pdf:' && queue.items.length === 1 && queue.items[0].file === b, 'send order or confirmed removal incorrect')
  await act(async () => { resolve?.(true); await first; await second })
  assert(queue.items.length === 0 && !queue.sending, 'confirmed queue not cleared')
})
await check('unconfirmed and thrown sends stop queue and prevent retry', async () => {
  for (const throws of [false, true]) {
    let calls = 0
    send = () => { calls++; if (throws) throw new Error('network'); return false }
    await act(async () => { queue.add([a, b]) })
    await act(async () => { await queue.send() })
    await act(async () => { await queue.send() })
    assert(calls === 1 && queue.items.length === 2 && queue.items[0].uncertain && !!queue.error, 'uncertain send retried or removed')
    await act(async () => queue.clear())
  }
})
await check('size boundary and disabling during a pending send', async () => {
  const limit = file('limit.pdf', 1024 * 1024)
  let calls = 0; let resolve: ((value: boolean) => void) | undefined
  send = () => { calls++; return new Promise<boolean>(done => { resolve = done }) }
  await act(async () => { queue.add([limit, b]) })
  assert(queue.items.length === 2 && !queue.error, '1 MiB boundary rejected')
  await act(async () => { void queue.send() })
  disabled = true
  await act(async () => { root.render(<Harness />) })
  await act(async () => { resolve?.(true); await Promise.resolve(); await Promise.resolve() })
  assert(calls === 1 && queue.items.length === 1 && queue.items[0].file === b, 'disabled queue did not stop after confirmation')
  disabled = false
  await act(async () => { root.render(<Harness />); queue.clear() })
})
await check('disabled and unmount prevent subsequent sends', async () => {
  let calls = 0; let resolve: ((value: boolean) => void) | undefined
  send = () => { calls++; return new Promise<boolean>(done => { resolve = done }) }
  disabled = true
  await act(async () => { root.render(<Harness />) })
  await act(async () => { queue.add([a, b]); await queue.send() })
  assert(calls === 0 && queue.items.length === 2, 'disabled queue sent or lost files')
  disabled = false
  await act(async () => { root.render(<Harness />) })
  await act(async () => { void queue.send() })
  assert(calls === 1, 'first send missing')
  await act(async () => { root.unmount(); resolve?.(true); await Promise.resolve() })
  assert(calls === 1, 'unmount allowed subsequent send')
})
root = createRoot(document.body)
const sent: { caption: string; file?: File }[] = []
await act(async () => root.render(<AttachmentWorkspace draftKey="attachment-test" onSend={(caption, file) => { sent.push({ caption, file }); return true }}><header>Conversation header</header></AttachmentWorkspace>))
function element<T extends Element>(selector: string): T { const found = document.querySelector<T>(selector); assert(found, `missing ${selector}`); return found }
function button(text: string) { const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === text); assert(found, `missing button ${text}`); return found }
await check('workspace selection, cancel confirmation and discard', async () => {
  const input = element<HTMLInputElement>('input[aria-label="Anexar arquivo"]')
  const transfer = new DataTransfer(); transfer.items.add(a); transfer.items.add(b)
  Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  assert(document.querySelector('[aria-label="Preparar envio de arquivos"]') && document.body.textContent?.includes('Conversation header'), 'workspace or conversation header missing')
  assert(document.querySelectorAll('[aria-label^="Selecionar arquivo "]').length === 2, 'attachments missing')
  const caption = () => element<HTMLTextAreaElement>('[aria-label="Legenda do arquivo"]')
  async function setCaption(value: string) {
    await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(caption(), value); caption().dispatchEvent(new Event('input', { bubbles: true })) })
  }
  await setCaption('primeira legenda')
  await act(async () => element<HTMLButtonElement>('[aria-label="Selecionar arquivo 2: b.pdf"]').click())
  assert(caption().value === '', 'second caption should start empty')
  await setCaption('segunda legenda')
  await act(async () => element<HTMLButtonElement>('[aria-label="Selecionar arquivo 1: a.pdf"]').click())
  assert(caption().value === 'primeira legenda', 'first caption lost after switching')
  await act(async () => element<HTMLButtonElement>('[aria-label="Selecionar arquivo 2: b.pdf"]').click())
  assert(caption().value === 'segunda legenda', 'second caption lost after switching')
  await act(async () => element<HTMLButtonElement>('[aria-label="Cancelar envio de arquivos"]').click())
  assert(document.body.textContent?.includes('Descartar arquivos?'), 'discard confirmation missing')
  await act(async () => button('Continuar preparando').click())
  assert(document.querySelector('[aria-label="Preparar envio de arquivos"]'), 'cancel discarded queue')
  await act(async () => element<HTMLButtonElement>('[aria-label="Cancelar envio de arquivos"]').click())
  await act(async () => button('Descartar').click())
  assert(!document.querySelector('[aria-label="Preparar envio de arquivos"]') && document.body.textContent?.includes('Conversation header'), 'discard failed')
})
await check('invalid-only attachment selection reports the validation error', async () => {
  const input = element<HTMLInputElement>('input[aria-label="Anexar arquivo"]')
  const transfer = new DataTransfer(); transfer.items.add(file('empty.pdf', 0))
  Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  assert(document.querySelector('[role="alert"]')?.textContent?.includes('vazios'), 'invalid files must produce a visible error')
})
async function waitFor(predicate: () => boolean, description: string) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)) })
  }
  throw new Error(`Timed out waiting for ${description}; buttons: ${[...document.querySelectorAll('button')].map(item => `${item.textContent?.trim()}/${item.getAttribute('aria-label')}/${item.disabled}`).join(', ')}; text: ${document.body.textContent?.slice(-1000)}`)
}
await check('real image editor applies, cancels, restores original and preserves caption', async () => {
  const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 12
  const context = canvas.getContext('2d'); assert(context, 'canvas unavailable')
  context.fillStyle = 'red'; context.fillRect(0, 0, 16, 12)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  assert(blob, 'PNG encoding failed')
  const original = new File([blob], 'photo.png', { type: 'image/png' })
  const input = element<HTMLInputElement>('input[aria-label="Anexar arquivo"]')
  const transfer = new DataTransfer(); transfer.items.add(original)
  Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  const caption = element<HTMLTextAreaElement>('[aria-label="Legenda do arquivo"]')
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(caption, 'foto especial'); caption.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => button('Editar').click())
  await waitFor(() => [...document.querySelectorAll('button')].some(item => item.textContent?.trim() === 'Aplicar' && !item.disabled), 'editor ready')
  const workspace = element<HTMLElement>('[aria-label="Preparar envio de arquivos"]')
  assert(!workspace.querySelector(':scope > header') && !workspace.querySelector('[aria-label="Cancelar envio de arquivos"]'), 'preparation header must be hidden while editing')
  assert(!workspace.textContent?.includes('Editar imagem'), 'secondary editor header must not be shown')
  assert(![...workspace.querySelectorAll('button')].some(item => item.textContent?.trim() === 'Cancelar edição'), 'secondary cancel button must not be shown')
  const cancelButtons = () => [...workspace.querySelectorAll<HTMLButtonElement>('button')].filter(item => item.textContent?.trim() === 'Cancelar' || item.getAttribute('aria-label') === 'Cancelar')
  assert(cancelButtons().length === 1 && !!cancelButtons()[0].closest('.iu-root'), 'native editor cancel button missing or duplicated')
  await check('all translated tools and responsive native tooltips', async () => {
    const tools = [...document.querySelectorAll<HTMLButtonElement>('.iu-rail__item')]
    const labels = ['Ajustar', 'Correções', 'Filtros', 'Anotações', 'Ocultar', 'Figurinhas', 'Molduras', 'Fundo', 'Redimensionar', 'Marca d’água']
    assert(JSON.stringify(tools.map(tool => tool.querySelector('.iu-rail__label')?.textContent)) === JSON.stringify(labels), 'tool labels or order incorrect')
    const editorRoot = element<HTMLElement>('.iu-root')
    const wrapper = editorRoot.parentElement
    assert(wrapper, 'editor wrapper missing')
    wrapper.style.flex = 'none'
    wrapper.style.width = '768px'
    assert(wrapper.clientWidth === 768, 'desktop wrapper width incorrect')
    const firstLabel = element<HTMLElement>('.iu-rail__label')
    await check('responsive tool labels use compiled project CSS', async () => {
      wrapper.style.width = '767px'
      assert(getComputedStyle(firstLabel).position !== 'absolute', 'mobile label must remain visible')
      wrapper.style.width = '768px'
      assert(getComputedStyle(firstLabel).position === 'absolute' && getComputedStyle(firstLabel).width === '1px', 'desktop label must be screen-reader only')
    })
    const target = tools[4]
    await act(async () => target.querySelector('svg')?.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })))
    await waitFor(() => document.querySelector('.iu-tooltip[aria-hidden="true"]')?.textContent === 'Ocultar', 'translated hover tooltip')
    await act(async () => target.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body, pointerType: 'mouse' })))
    await waitFor(() => !document.querySelector('.iu-tooltip'), 'tooltip dismissal')
    await act(async () => tools[9].focus())
    await waitFor(() => document.querySelector('.iu-tooltip[aria-hidden="true"]')?.textContent === 'Marca d’água', 'translated focus tooltip')
    await act(async () => tools[9].blur())
    wrapper.style.width = '767px'
    assert(wrapper.clientWidth === 767, 'mobile wrapper width incorrect')
    assert(getComputedStyle(firstLabel).position !== 'absolute', 'mobile label must remain visible')
    await act(async () => target.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' })))
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 500)) })
    assert(!target.hasAttribute('data-tooltip') && !document.querySelector('.iu-tooltip'), 'mobile hover must not show rail tooltip')
    await act(async () => tools[9].focus())
    assert(!tools[9].hasAttribute('data-tooltip') && !document.querySelector('.iu-tooltip'), 'mobile focus must not show rail tooltip')
    await act(async () => tools[9].blur())
    wrapper.style.removeProperty('width'); wrapper.style.removeProperty('flex')
  })
  await act(async () => button('Aplicar').click())
  await waitFor(() => !!document.querySelector('[aria-label="Restaurar imagem original"]'), 'edited image applied')
  assert(document.body.textContent?.includes('photo-editada.png'), 'edited filename missing')
  assert(element<HTMLTextAreaElement>('[aria-label="Legenda do arquivo"]').value === 'foto especial', 'caption lost on apply')
  await act(async () => button('Editar').click())
  await waitFor(() => cancelButtons().length === 1, 'editor reopened')
  await act(async () => cancelButtons()[0].click())
  assert(document.body.textContent?.includes('Descartar esta edição?'), 'edit discard confirmation missing')
  await act(async () => button('Continuar preparando').click())
  assert(cancelButtons().length === 1 && !!workspace.querySelector('.iu-root'), 'cancel confirmation did not preserve editing')
  await act(async () => cancelButtons()[0].click())
  await act(async () => button('Descartar').click())
  assert(document.body.textContent?.includes('photo-editada.png'), 'cancel edit lost previous file')
  await act(async () => element<HTMLButtonElement>('[aria-label="Restaurar imagem original"]').click())
  assert(!document.querySelector('[aria-label="Restaurar imagem original"]') && document.body.textContent?.includes('photo.png'), 'original not restored')
  assert(element<HTMLTextAreaElement>('[aria-label="Legenda do arquivo"]').value === 'foto especial', 'caption lost on restore')
  await act(async () => element<HTMLButtonElement>('[aria-label="Enviar 1 arquivo"]').click())
  assert(sent.length === 1 && sent[0].file === original && sent[0].caption === 'foto especial', 'original file or caption not sent')
  Object.defineProperty(input, 'files', { configurable: true, value: transfer.files })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
  const nextCaption = element<HTMLTextAreaElement>('[aria-label="Legenda do arquivo"]')
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(nextCaption, 'editada'); nextCaption.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => button('Editar').click())
  await waitFor(() => [...document.querySelectorAll('button')].some(item => item.textContent?.trim() === 'Aplicar' && !item.disabled), 'editor ready for edited send')
  await act(async () => button('Aplicar').click())
  await waitFor(() => !!document.querySelector('[aria-label="Restaurar imagem original"]'), 'edited image ready to send')
  await act(async () => element<HTMLButtonElement>('[aria-label="Enviar 1 arquivo"]').click())
  const exported = sent[1]?.file
  assert(sent.length === 2 && sent[1].caption === 'editada' && exported instanceof File && exported !== original && exported.name === 'photo-editada.png' && exported.type === 'image/png' && exported.size > 0, 'edited image and caption not sent')
})
await act(async () => root.unmount())
await check('unavailable limit blocks the attachment queue', async () => {
  const unavailableStore = createStore()
  unavailableStore.set(queryClientAtom, new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }))
  root = createRoot(document.body)
  await act(async () => root.render(<Provider store={unavailableStore}><Harness /></Provider>))
  await act(async () => { queue.add([a]); await queue.send() })
  assert(queue.maxFileSizeBytes === null && queue.maxFileSizeMb === null && queue.items.length === 0 && !!queue.error, 'unavailable limit did not block attachments')
  await act(async () => root.unmount())
})
document.body.textContent = JSON.stringify(results)
