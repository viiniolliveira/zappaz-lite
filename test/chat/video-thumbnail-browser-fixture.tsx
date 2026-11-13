import { createRoot } from 'react-dom/client'
import MessageBubble from '../../src/components/chat/message-bubble.tsx'
import { mockConversations } from './mock-data.ts'
import { sentVideoThumbnail } from '../media/sent-video-thumbnail.ts'
import { api } from '../../src/lib/api-client.ts'
import { mockThumbnailBase64 } from './mock-thumbnail.ts'

const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const original = mockConversations[0].messages.find(message => message.type === 'video')!
const message = { ...original, fromMe: true, text: 'Vídeo de teste enviado pela Zappaz.', media: { ...original.media!, thumbnail: { mimeType: 'image/jpeg' as const, base64: sentVideoThumbnail, width: 32, height: 18 } } }
let opened = false
const root = createRoot(document.getElementById('root')!)

async function run() {
  root.render(<main className="p-4"><ul data-case="single"><MessageBubble message={message} onOpenMedia={() => { opened = true }} /></ul><ul data-case="grid" className="grid max-w-sm grid-cols-2 gap-1"><MessageBubble message={message} grouped onOpenMedia={() => { opened = true }} /></ul></main>)
  for (let i = 0; i < 150; i++) {
    const images = [...document.querySelectorAll<HTMLImageElement>('img')]
    if (images.length === 2 && images.every(image => image.complete && image.naturalWidth > 0)) break
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  for (const kind of ['single', 'grid']) {
    const visual = document.querySelector<HTMLElement>(`[data-case="${kind}"] [data-slot="message-media-visual"]`)!
    const image = visual.querySelector('img')!
    check(image?.naturalWidth === 32 && image.naturalHeight === 18, `${kind}: original thumbnail did not load`)
    const rect = visual.getBoundingClientRect()
    const imageRect = image.getBoundingClientRect()
    check(rect.width >= (kind === 'single' ? 200 : 100), `${kind}: preview remained at thumbnail size (${rect.width}px)`)
    check(rect.right <= innerWidth && rect.left >= 0, `${kind}: video overflows viewport`)
    check(Math.abs(imageRect.width - rect.width) <= 1, `${kind}: image does not fill preview`)
    check(Math.abs(rect.width / rect.height - (kind === 'single' ? 32 / 18 : 1)) < 0.02, `${kind}: incorrect aspect ratio`)
    for (const overlay of visual.querySelectorAll<HTMLElement>('button, [data-slot="message-metadata"]')) {
      const bounds = overlay.getBoundingClientRect()
      check(bounds.left >= rect.left - 1 && bounds.right <= rect.right + 1 && bounds.top >= rect.top - 1 && bounds.bottom <= rect.bottom + 1, `${kind}: overlay extends outside preview`)
    }
    check(!visual.querySelector('video'), `${kind}: preview must not download the video`)
  }
  document.querySelector<HTMLButtonElement>('[aria-label="Abrir vídeo na galeria"]')!.click()
  check(opened, 'preview did not open the gallery')
  const originalImage = mockConversations[0].messages.find(message => message.type === 'image')!
  for (const failure of ['missing', 'with-preview', 'broken-preview', 'broken-file']) {
    let recovered = false
    let requests = 0
    api.defaults.adapter = async config => {
      requests++
      if (!recovered && failure !== 'broken-file') throw new Error('Arquivo indisponível')
      const data = !recovered
        ? new Blob(['not an image'], { type: 'image/jpeg' })
        : new Blob([Uint8Array.from(atob(sentVideoThumbnail), char => char.charCodeAt(0))], { type: 'image/jpeg' })
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    }
    const thumbnail = failure === 'with-preview' || failure === 'broken-file'
      ? { mimeType: 'image/jpeg' as const, base64: mockThumbnailBase64, width: 80, height: 60 }
      : failure === 'broken-preview' ? { ...message.media.thumbnail, base64: 'broken' } : null
    const imageMessage = { ...originalImage, media: { ...originalImage.media!, thumbnail } }
    root.render(<main className="p-4"><ul><MessageBubble key={failure} message={imageMessage} onOpenMedia={() => { opened = true }} /></ul></main>)
    window.scrollTo(0, 0)
    for (let i = 0; i < 150; i++) {
      const image = document.querySelector('img')
      const alert = document.querySelector('[role="alert"]')
      if (requests && alert && (thumbnail?.base64 === mockThumbnailBase64 ? image?.naturalWidth === 80 : !image)) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    const visual = document.querySelector<HTMLElement>('[data-slot="message-media-visual"]')!
    const rect = visual.getBoundingClientRect()
    const alert = document.querySelector('[role="alert"]')!
    check(requests > 0 && alert, `${failure}: download error was not displayed`)
    if (!thumbnail || thumbnail.base64 !== mockThumbnailBase64) check(rect.width >= 200 && rect.height >= 100, `${failure}: unavailable image collapsed`)
    check(rect.right <= innerWidth && rect.left >= 0, `${failure}: unavailable image overflows`)
    check(!visual.textContent?.includes('image'), `${failure}: raw media type displayed`)
    const image = visual.querySelector('img')
    if (thumbnail?.base64 === mockThumbnailBase64) {
      check(image?.naturalWidth === 80, `${failure}: valid preview was not preserved`)
      check(alert.textContent?.includes('A prévia continua disponível'), `${failure}: available preview feedback missing`)
    } else {
      check(!image, `${failure}: broken image element still visible`)
      check(visual.textContent?.includes('Imagem indisponível'), `${failure}: placeholder missing`)
      check(!alert.textContent?.includes('A prévia continua disponível'), `${failure}: nonexistent preview advertised`)
    }
    const metadata = visual.querySelector<HTMLElement>('[data-slot="message-metadata"]')!.getBoundingClientRect()
    check(metadata.top >= rect.top && metadata.bottom <= rect.bottom + 1, `${failure}: metadata outside image`)
    recovered = true
    alert.querySelector('button')!.click()
    for (let i = 0; i < 150; i++) {
      if (!document.querySelector('[role="alert"]') && document.querySelector('img')?.naturalWidth === 32) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    check(requests >= 2 && !document.querySelector('[role="alert"]') && document.querySelector('img')?.naturalWidth === 32, `${failure}: retry did not recover`)
  }
  for (const [width, height] of [[900, 1600], [1600, 900], [800, 800]]) {
    api.defaults.adapter = async config => ({ data: new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="green"/></svg>`], { type: 'image/svg+xml' }), status: 200, statusText: 'OK', headers: {}, config })
    const imageMessage = { ...originalImage, media: { ...originalImage.media!, width, height, thumbnail: null } }
    root.render(<main className="p-4"><ul><MessageBubble key={`${width}-${height}`} message={imageMessage} onOpenMedia={() => { opened = true }} /></ul></main>)
    window.scrollTo(0, 0)
    for (let i = 0; i < 150; i++) {
      if (document.querySelector('img')?.naturalWidth === width) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    const visual = document.querySelector<HTMLElement>('[data-slot="message-media-visual"]')!.getBoundingClientRect()
    const image = document.querySelector('img')!
    const bounds = image.getBoundingClientRect()
    check(image.naturalWidth === width, `${width}x${height}: original image did not load`)
    check(Math.abs(bounds.width / bounds.height - width / height) < 0.02, `${width}x${height}: image ratio changed`)
    check(Math.abs(visual.width - bounds.width) <= 1 && Math.abs(visual.height - bounds.height) <= 1, `${width}x${height}: frame adds empty bands`)
    check(visual.right <= innerWidth && visual.left >= 0, `${width}x${height}: image overflows viewport`)
    check(bounds.height <= 320, `${width}x${height}: image exceeds maximum height`)
  }
  root.unmount()
  document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
