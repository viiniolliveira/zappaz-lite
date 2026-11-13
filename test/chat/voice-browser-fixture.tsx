import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createStore, getDefaultStore, Provider } from 'jotai'
import { QueryClient } from '@tanstack/react-query'
import { queryClientAtom } from 'jotai-tanstack-query'
import { useVoiceRecorder } from '../../src/components/chat/use-voice-recorder'
import MessageComposer from '../../src/components/chat/message-composer'

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
queryClient.setQueryData(['media', 'limits'], { maxFileSizeBytes: 1024 * 1024, maxFileSizeMb: 1 })
const store = getDefaultStore()
store.set(queryClientAtom, queryClient)

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: String(error) }) } }
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
let stopped = 0
const track = { enabled: true, stop() { stopped++ }, addEventListener() {} }
const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
let permission: () => Promise<unknown> = async () => stream
let chunk: BlobPart = 'chunk'
Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => permission() } })
class FakeRecorder {
  static isTypeSupported(type: string) { return type.startsWith('audio/webm') }
  state = 'inactive'; mimeType = 'audio/webm;codecs=opus'
  ondataavailable: ((event: { data: Blob }) => void) | null = null
  onpause: (() => void) | null = null; onresume: (() => void) | null = null; onstop: (() => void) | null = null
  start() { this.state = 'recording' }
  pause() { this.state = 'paused'; this.onpause?.() }
  resume() { this.state = 'recording'; this.onresume?.() }
  requestData() { this.ondataavailable?.({ data: new Blob([chunk], { type: this.mimeType }) }) }
  stop() { this.requestData(); this.state = 'inactive'; this.onstop?.() }
}
class FakeContext {
  state = 'running'
  createAnalyser() { return { fftSize: 256, getByteTimeDomainData() {} } }
  createMediaStreamSource() { return { connect() {} } }
  async resume() {}
  async close() { this.state = 'closed' }
}
Object.assign(globalThis, { MediaRecorder: FakeRecorder, AudioContext: FakeContext })
let clock = 1000
Object.defineProperty(performance, 'now', { configurable: true, value: () => { clock += 100; return clock } })
let recorder: ReturnType<typeof useVoiceRecorder>
let disabled = false
function Harness() { recorder = useVoiceRecorder(disabled); return null }
let root = createRoot(document.body)
await act(async () => root.render(<Harness />))
await check('pause snapshot, resume, finish and cleanup', async () => {
  await act(async () => { await recorder.start() })
  assert(recorder.status === 'recording', 'not recording')
  await act(async () => recorder.pause())
  assert(recorder.status === 'paused' && recorder.preview?.size === 5 && !track.enabled, 'pause or snapshot failed')
  await act(async () => recorder.resume())
  assert(recorder.status === 'recording' && recorder.preview === null && track.enabled, 'resume failed')
  let file: File | null = null
  await act(async () => { file = await recorder.finish() })
  assert(file instanceof File && file.size === 10 && file.type.startsWith('audio/webm') && stopped === 1, 'final audio or cleanup failed')
  await act(async () => recorder.discard())
})
await check('recording above the configured 1 MiB is rejected and releases the microphone', async () => {
  chunk = new Uint8Array(1024 * 1024 + 1)
  const before = stopped
  await act(async () => { await recorder.start() })
  await act(async () => recorder.pause())
  assert(recorder.error?.includes('1 MiB') && stopped === before + 1, 'configured recording limit or cleanup failed')
  let result: File | null = null
  await act(async () => { result = await recorder.finish(); recorder.discard() })
  assert(result === null, 'oversized recording was returned')
  chunk = 'chunk'
})
await check('permission denial and unsupported browser', async () => {
  permission = async () => { throw new DOMException('denied', 'NotAllowedError') }
  await act(async () => { await recorder.start() })
  assert(recorder.status === 'idle' && recorder.error?.includes('Permita'), 'permission error missing')
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  await act(async () => { await recorder.start() })
  assert(recorder.error?.includes('navegador'), 'unsupported error missing')
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: () => permission() } })
})
await check('cancel pending permission stops late stream', async () => {
  let resolve: ((value: unknown) => void) | undefined
  permission = () => new Promise(done => { resolve = done })
  await act(async () => { void recorder.start() })
  assert(recorder.status === 'requesting', 'not requesting')
  await act(async () => recorder.discard())
  const before = stopped
  await act(async () => { resolve?.(stream); await Promise.resolve() })
  assert(stopped === before + 1 && recorder.status === 'idle', 'late stream leaked')
})
await check('disabled pauses and unmount stops recording', async () => {
  permission = async () => stream
  await act(async () => { await recorder.start() })
  disabled = true
  await act(async () => root.render(<Harness />))
  assert(recorder.status === 'paused' && !track.enabled, 'disabled did not pause')
  await act(async () => recorder.resume())
  assert(recorder.status === 'paused', 'resumed while disabled')
  const before = stopped
  await act(async () => root.unmount())
  assert(stopped === before + 1, 'unmount leaked track')
})
await check('StrictMode discards stale permission and unmount releases active stream', async () => {
  disabled = false
  const pending: ((value: unknown) => void)[] = []
  permission = () => new Promise(done => pending.push(done))
  root = createRoot(document.body)
  await act(async () => root.render(<StrictMode><Harness /></StrictMode>))
  assert(pending.length === 1, 'StrictMode should cancel the first setup before requesting permission')
  const before = stopped
  await act(async () => { pending[0](stream); await Promise.resolve() })
  assert(recorder.status === 'recording', 'latest StrictMode stream not recording')
  await act(async () => root.unmount())
  assert(stopped === before + 1, 'active StrictMode stream leaked')
})
let playing = false
let plays = 0
Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => !playing })
HTMLMediaElement.prototype.play = async function () { playing = true; plays++; this.dispatchEvent(new Event('play')) }
HTMLMediaElement.prototype.pause = function () { playing = false; this.dispatchEvent(new Event('pause')) }
HTMLMediaElement.prototype.load = function () {}
function button(label: string): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  assert(found, `missing ${label}`)
  return found
}
async function click(label: string) { await act(async () => { button(label).click(); await Promise.resolve() }) }
function textarea(): HTMLTextAreaElement {
  const found = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Mensagem"]')
  assert(found, 'missing draft')
  return found
}
let send: (text: string, file?: File, voice?: boolean) => boolean | Promise<boolean> = () => true
function Composer() { return <Provider store={store}><MessageComposer draftKey="voice-test" onSend={(text, file, voice) => send(text, file, voice)} onAttach={() => true} /></Provider> }
permission = async () => stream
root = createRoot(document.body)
await act(async () => root.render(<Composer />))
await check('inline recorder pause, play, resume and cancel preserve draft', async () => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(textarea(), 'rascunho')
    textarea().dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('Gravar áudio')
  assert(document.querySelector('[aria-label="Gravador de mensagem de voz"]') && !document.querySelector('textarea'), 'recorder should replace input inline')
  await click('Pausar gravação')
  assert(!button('Ouvir gravação').disabled, 'preview unavailable')
  await click('Ouvir gravação')
  assert(plays === 1 && !!button('Pausar prévia'), 'preview did not play')
  await click('Retomar gravação')
  assert(!!button('Pausar gravação'), 'recording did not resume')
  await click('Cancelar gravação')
  assert(textarea().value === 'rascunho', 'cancel lost draft')
})
await check('successful voice send is locked and retains draft', async () => {
  const calls: { text: string; file?: File; voice?: boolean }[] = []
  let resolve: ((value: boolean) => void) | undefined
  send = (text, file, voice) => { calls.push({ text, file, voice }); return new Promise(done => { resolve = done }) }
  await click('Gravar áudio')
  await click('Pausar gravação')
  await act(async () => { button('Enviar áudio').click(); button('Enviar áudio').click(); await Promise.resolve() })
  assert(calls.length === 1 && calls[0].text === '' && calls[0].file instanceof File && calls[0].file.size > 0 && calls[0].voice === true, 'voice payload or duplicate lock incorrect')
  await act(async () => { resolve?.(true); await Promise.resolve() })
  assert(textarea().value === 'rascunho', 'success lost draft')
})
await check('unconfirmed voice keeps preview and blocks another send', async () => {
  let calls = 0
  send = () => { calls++; return false }
  await click('Gravar áudio')
  await click('Pausar gravação')
  await click('Enviar áudio')
  assert(calls === 1 && document.querySelector('[role="alert"]')?.textContent?.includes('não confirmado'), 'missing uncertain send warning')
  assert(!button('Ouvir gravação').disabled && button('Enviar áudio').disabled, 'preview lost or resend enabled')
  await click('Enviar áudio')
  assert(calls === 1, 'unconfirmed send retried')
  await click('Cancelar gravação')
  assert(textarea().value === 'rascunho', 'uncertain discard lost draft')
})
await act(async () => root.unmount())
await check('unavailable limit blocks recording before microphone access', async () => {
  const unavailableStore = createStore()
  unavailableStore.set(queryClientAtom, new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } }))
  let accesses = 0
  permission = async () => { accesses++; return stream }
  root = createRoot(document.body)
  await act(async () => root.render(<Provider store={unavailableStore}><Harness /></Provider>))
  await act(async () => { await recorder.start() })
  assert(accesses === 0 && recorder.status === 'idle' && !!recorder.error, 'recording allowed without limits')
  await act(async () => root.unmount())
})
document.body.textContent = JSON.stringify(results)
