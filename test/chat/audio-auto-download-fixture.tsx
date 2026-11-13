import { act } from 'react'
import { createRoot } from 'react-dom/client'
import MessageAudio from '../../src/components/chat/messages/message-audio'
import { api } from '../../src/lib/api-client'
import type { MediaDTO } from '../../src/lib/chat/schemas'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message) }
let plays = 0
HTMLMediaElement.prototype.load = function () {
  if (this.src) {
    this.dispatchEvent(new Event('loadstart'))
    this.dispatchEvent(new Event('loadedmetadata'))
    this.dispatchEvent(new Event('canplay'))
  }
}
HTMLMediaElement.prototype.pause = function () {}
HTMLMediaElement.prototype.play = async function () { plays++; this.dispatchEvent(new Event('play')) }
Object.assign(globalThis, { OfflineAudioContext: class {
  async decodeAudioData() { return { numberOfChannels: 1, duration: 1, getChannelData: () => new Float32Array(8000) } }
} })
const observers = new Map<Element, (entries: { isIntersecting: boolean }[]) => void>()
Object.assign(globalThis, { IntersectionObserver: class {
  constructor(private callback: (entries: { isIntersecting: boolean }[]) => void) {}
  observe(element: Element) { observers.set(element, this.callback) }
  disconnect() {}
} })
let requests = 0
let fail = false
let release: (() => void) | null = null
api.defaults.adapter = async config => {
  requests++
  if (fail) throw new Error('Download failed')
  await new Promise<void>(resolve => { release = resolve })
  return { data: new Blob(['audio'], { type: 'audio/wav' }), status: 200, statusText: 'OK', headers: {}, config }
}
const id = '00000000-0000-4000-8000-000000000001'
const media: MediaDTO = {
  id, sessionId: id, conversationId: id, messageRecordId: id, kind: 'audio', mimeType: 'audio/wav', fileName: null,
  size: 5, duration: 1, width: null, height: null, voice: true, thumbnail: null, storageStatus: 'not_saved',
  contentPath: `/api/v1/session/${id}/conversations/${id}/media/${id}/content`,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), revision: 1,
}
const root = createRoot(document.body)
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: String(error) }) } }
async function visible() {
  const element = document.querySelector('[data-slot="message-audio"]')
  assert(element, 'missing audio')
  const observer = observers.get(element)
  assert(observer, 'audio did not subscribe to visibility')
  await act(async () => { observer([{ isIntersecting: true }]); await Promise.resolve() })
}
await act(async () => root.render(<MessageAudio media={media} />))
await check('audio waits for visibility and downloads automatically without playing', async () => {
  assert(requests === 0, 'download started offscreen')
  await visible()
  assert(requests === 1, 'visible audio did not download automatically')
  assert(document.querySelector<HTMLButtonElement>('[aria-label="Carregando áudio"]')?.disabled, 'missing loading state')
  await act(async () => { release?.(); await Promise.resolve() })
  assert(document.querySelector('[aria-label="Reproduzir áudio"]'), 'audio not ready to play')
  assert(plays === 0, 'audio played automatically')
})
await check('play remains an explicit action', async () => {
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Reproduzir áudio"]')?.click())
  assert(plays === 1 && requests === 1, 'play did not use downloaded audio')
})
await check('download errors allow manual retry without autoplay', async () => {
  fail = true
  await act(async () => root.render(<MessageAudio key="failed" media={media} />))
  await visible()
  assert(requests === 2 && document.querySelector('[role="alert"]'), 'download failure not shown')
  fail = false
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Tentar baixar áudio novamente"]')?.click())
  assert(requests === 3, 'retry did not download')
  await act(async () => { release?.(); await Promise.resolve() })
  assert(document.querySelector('[aria-label="Reproduzir áudio"]') && plays === 1, 'retry failed or played automatically')
})
await act(async () => root.unmount())
document.body.textContent = JSON.stringify(results)
