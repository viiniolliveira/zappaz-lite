import { createRoot } from 'react-dom/client'
import MessageMedia from '../../src/components/chat/messages/message-media'
import { api } from '../../src/lib/api-client'
import { mockConversations } from './mock-data'
import type { MediaDTO } from '../../src/lib/chat/schemas'

const base = mockConversations[0].messages.find(message => message.media)!.media!
const media: MediaDTO = { ...base, kind: 'document', fileName: 'relatorio.pdf', mimeType: 'application/pdf', size: 1200, thumbnail: null }
media.contentPath = `/api/v1/session/${media.sessionId}/conversations/${media.conversationId}/media/${media.id}/content`
let calls = 0
let finish: (() => void) | undefined
let fail = false
api.defaults.adapter = config => {
  calls++
  if (fail) return Promise.reject(new Error('offline'))
  return new Promise(resolve => { finish = () => resolve({ config, data: new Blob(['pdf'], { type: 'application/pdf' }), status: 200, statusText: 'OK', headers: {} }) })
}
window.fetch = () => Promise.reject(new Error('unexpected network'))
class VisibleObserver implements IntersectionObserver {
  readonly root = null; readonly rootMargin = '0px'; readonly thresholds = [0]
  constructor(private callback: IntersectionObserverCallback) {}
  observe(target: Element) { this.callback([{ isIntersecting: true, target } as IntersectionObserverEntry], this) }
  unobserve() {} disconnect() {} takeRecords(): IntersectionObserverEntry[] { return [] }
}
window.IntersectionObserver = VisibleObserver
const wait = async (fn: () => boolean, label: string) => { for (let i = 0; i < 150; i++) { if (fn()) return; await new Promise(resolve => setTimeout(resolve, 20)) } throw new Error(label) }
function check(condition: unknown, label: string): asserts condition { if (!condition) throw new Error(label) }
const root = createRoot(document.getElementById('root')!)
let opened: Blob | null | undefined
const render = (item: MediaDTO) => root.render(<MessageMedia media={item} onOpen={blob => { opened = blob }} />)
const button = (name: string) => document.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
async function run() {
  let downloads: string[] = []
  const original = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () { downloads.push(this.download) }
  render(media)
  await wait(() => !!button('Baixar relatorio.pdf'), 'mount')
  await new Promise(resolve => setTimeout(resolve, 100))
  check(calls === 0, 'download occurred before interaction')
  button('Abrir relatorio.pdf').click()
  check(opened === null && calls === 0, 'open did not forward null or fetched document')
  button('Baixar relatorio.pdf').click()
  await wait(() => calls === 1 && !!finish, 'request')
  await wait(() => button('Baixar relatorio.pdf').disabled, 'loading must disable download')
  finish!()
  await wait(() => downloads.length === 1, 'automatic download')
  check(downloads[0] === 'relatorio.pdf', 'original filename')
  await wait(() => !!document.querySelector('a[download="relatorio.pdf"]'), 'download link')
  check(calls === 1 && downloads.length === 1, 'duplicate request or download')
  document.querySelector<HTMLAnchorElement>('a[download="relatorio.pdf"]')!.click()
  check(downloads.length === 2 && calls === 1, 'cached link should download once without another request')
  button('Abrir relatorio.pdf').click()
  check(opened instanceof Blob, 'open must receive downloaded blob')
  root.unmount()
  const node = document.createElement('div'); document.body.append(node)
  const next = createRoot(node)
  fail = true; finish = undefined
  next.render(<MessageMedia media={media} onOpen={() => {}} />)
  await wait(() => !!button('Baixar relatorio.pdf'), 'retry mount')
  button('Baixar relatorio.pdf').click()
  await wait(() => !!document.querySelector('[role=alert]'), 'error alert')
  fail = false
  button('Baixar relatorio.pdf').click()
  await wait(() => !!finish, 'retry request')
  finish!()
  await wait(() => downloads.length === 3, 'retry download')
  check(calls === 3, 'retry count')
  next.unmount()
  const brokenThumbnailNode = document.createElement('div'); document.body.append(brokenThumbnailNode)
  const brokenThumbnailRoot = createRoot(brokenThumbnailNode)
  brokenThumbnailRoot.render(<MessageMedia media={{ ...media, thumbnail: { mimeType: 'image/jpeg', base64: 'broken', width: 1, height: 1 } }} onOpen={blob => { opened = blob }} />)
  await wait(() => !!button('Baixar relatorio.pdf'), 'broken thumbnail mount')
  check(!button('Baixar relatorio.pdf').disabled, 'download remains available with a broken thumbnail')
  await wait(() => !document.querySelector('img'), 'broken thumbnail removed')
  check(document.body.textContent?.includes('relatorio.pdf'), 'broken thumbnail hid filename')
  opened = undefined
  button('Abrir relatorio.pdf').click()
  check(opened === null && calls === 3, 'opening a document must not download it')
  brokenThumbnailRoot.unmount(); HTMLAnchorElement.prototype.click = original
  document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
