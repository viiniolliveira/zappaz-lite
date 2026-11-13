import { createRoot } from 'react-dom/client'
import MediaGallery from '../../src/components/chat/media-gallery'
import { useChatMedia } from '../../src/hooks/use-chat-media'
import { getChatMediaMessages } from '../../src/lib/chat/media-library'
import { mockConversations, mockSessionId } from './mock-data'
import type { MediaDTO } from '../../src/lib/chat/schemas'

const conversation = mockConversations[0]
const media = getChatMediaMessages(conversation.messages, mockSessionId, conversation.id)
const bytes = Uint8Array.from(atob(media[0].media.thumbnail!.base64), char => char.charCodeAt(0))
const imageBlob = new Blob([bytes], { type: 'image/jpeg' })
const videoBlob = new Blob(['video'], { type: 'video/mp4' })
let observed = 0
class SilentObserver implements IntersectionObserver {
  readonly root = null
  readonly rootMargin = '0px'
  readonly thresholds = [0]
  observe() { observed++ }
  unobserve() {}
  disconnect() {}
  takeRecords(): IntersectionObserverEntry[] { return [] }
}
window.IntersectionObserver = SilentObserver

const wait = async (condition: () => boolean, label: string) => {
  for (let i = 0; i < 150; i++) {
    if (condition()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error(`Timeout: ${label}`)
}
function check(value: unknown, message: string) { if (!value) throw new Error(message) }
let immediate: ReturnType<typeof useChatMedia> | undefined
let visible: ReturnType<typeof useChatMedia> | undefined
let stale = false
function Probe({ item, blob }: { item: MediaDTO; blob: Blob }) {
  immediate = useChatMedia(item, true, blob, 'immediate')
  visible = useChatMedia(item, true, blob)
  if (immediate.blob && immediate.blob !== blob) stale = true
  // No element is ever attached to immediate.elementRef, as before a portal mounts.
  return <div ref={visible.elementRef} />
}
async function run() {
  let requests = 0
  window.fetch = () => { requests++; return Promise.reject(new Error('Unexpected network request')) }
  const root = createRoot(document.getElementById('root')!)
  root.render(<MediaGallery messages={conversation.messages} sessionId={mockSessionId} conversationId={conversation.id} displayName="Contato" initialMessageId={media[0].id} initialBlob={imageBlob} onClose={() => {}} onRestoreFocus={() => {}} />)
  await wait(() => {
    const image = document.querySelector<HTMLImageElement>('[data-slot="media-gallery-preview"] img')
    const download = document.querySelector<HTMLAnchorElement>('a[aria-label="Baixar arquivo"]')
    return !!image && image.src.startsWith('blob:') && image.complete && image.naturalWidth > 0 && !!download?.href.startsWith('blob:')
  }, 'real gallery loads blob without intersection')
  check(!document.querySelector('[data-slot="media-gallery-preview"] [role="status"]'), 'gallery is still loading')
  root.render(<Probe item={media[0].media} blob={imageBlob} />)
  await wait(() => immediate?.state === 'ready' && observed > 0, 'immediate hook without a ref')
  check(immediate?.blob === imageBlob && !!immediate.url, 'immediate did not reuse source blob')
  const firstUrl = immediate?.url
  await new Promise(resolve => setTimeout(resolve, 100))
  check(visible?.state === 'idle' && visible.blob === null && visible.url === null, 'default mode downloaded without visibility')
  root.render(<Probe item={media[1].media} blob={videoBlob} />)
  await wait(() => immediate?.blob === videoBlob && immediate.state === 'ready', 'immediate media change')
  check(immediate?.url !== firstUrl && !stale, 'old blob exposed after media change')
  check(visible?.state === 'idle' && visible.blob === null, 'default mode loaded after media change')
  check(requests === 0, 'unexpected network request')
  root.unmount()
  document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
