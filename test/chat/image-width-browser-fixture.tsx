import { createRoot } from 'react-dom/client'
import MessageBubble from '../../src/components/chat/message-bubble.tsx'
import { api } from '../../src/lib/api-client.ts'
import { mockConversations } from './mock-data.ts'
import { mockThumbnailBase64 } from './mock-thumbnail.ts'

const root = createRoot(document.getElementById('root')!)
const original = mockConversations[0].messages.find(message => message.type === 'image')!
const captions = ['Curta', 'Uma legenda comprida com várias palavras que devem quebrar em linhas sem aumentar a largura da imagem. '.repeat(4), `https://example.test/${'longosemespacos'.repeat(30)}`]
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const wait = async (condition: () => unknown, label: string) => {
  for (let i = 0; i < 200; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 20)) }
  throw new Error(`timeout: ${label}`)
}

async function run() {
  for (const [width, height, metadata] of [[80, 80, true], [80, 40, true], [40, 80, true], [20, 200, true], [80, 80, false]] as const) {
    api.defaults.adapter = async config => ({ config, status: 200, statusText: 'OK', headers: {}, data: new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="green"/></svg>`], { type: 'image/svg+xml' }) })
    const message = { ...original, media: { ...original.media!, width: metadata ? width : null, height: metadata ? height : null, thumbnail: null } }
    root.render(<main className="p-4"><ul><MessageBubble key={`${width}-${height}-${metadata}`} message={message} onOpenMedia={() => {}} /></ul></main>)
    await wait(() => document.querySelector('img')?.naturalWidth === width, `small image ${width}x${height}`)
    await wait(() => {
      const box = document.querySelector<HTMLElement>('[data-slot="message-media-visual"]')!.getBoundingClientRect()
      return Math.abs(box.width / box.height - width / height) < 0.01
    }, `small image ratio ${width}x${height}`)
    const box = document.querySelector<HTMLElement>('[data-slot="message-media-visual"]')!.getBoundingClientRect()
    check(Math.abs(box.width - Math.min(280, 320 * width / height, innerWidth * 0.7)) <= 1, `small image width ${width}x${height}: ${box.width}`)
    check(box.height <= 321 && box.right <= innerWidth + 1, `small image exceeds bounds: ${box.width}x${box.height}`)
  }
  for (const scenario of ['landscape', 'portrait', 'error-preview', 'error-placeholder'] as const) {
    const widths: number[] = []
    for (const [index, caption] of captions.entries()) {
      const error = scenario.startsWith('error')
      const width = scenario === 'portrait' ? 900 : 1600
      const height = scenario === 'portrait' ? 1600 : 900
      let calls = 0
      api.defaults.adapter = async config => {
        calls++
        if (error) throw new Error('indisponível')
        return { config, status: 200, statusText: 'OK', headers: {}, data: new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="green"/></svg>`], { type: 'image/svg+xml' }) }
      }
      const thumbnail = scenario === 'error-preview' ? { mimeType: 'image/jpeg' as const, base64: mockThumbnailBase64, width: 80, height: 60 } : null
      const message = { ...original, text: caption, media: { ...original.media!, thumbnail } }
      root.render(<main className="p-4"><ul><MessageBubble key={`${scenario}-${index}`} message={message} onOpenMedia={() => {}} /></ul></main>)
      window.scrollTo(0, 0)
      await wait(() => calls > 0 && (error ? !!document.querySelector('[role="alert"]') : document.querySelector('img')?.naturalWidth === width), `${scenario} ${index}`)
      if (thumbnail) await wait(() => document.querySelector('img')?.naturalWidth === 80, 'preview loaded')
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      const frame = document.querySelector<HTMLElement>('li[data-message-id] > div')!
      const visual = frame.querySelector<HTMLElement>('[data-slot="message-media-visual"]')!
      const text = [...frame.querySelectorAll('p')].find(item => item.textContent === caption)!
      const box = frame.getBoundingClientRect()
      const image = visual.getBoundingClientRect()
      const label = `${scenario} caption ${index}`
      widths.push(box.width)
      check(box.width - image.width <= 11, `${label}: bubble ${box.width}px vs visual ${image.width}px`)
      check(box.left >= 0 && box.right <= innerWidth + 1, `${label}: bubble outside viewport`)
      check(text.scrollWidth <= text.clientWidth + 1, `${label}: caption overflows`)
      const textBox = text.getBoundingClientRect()
      check(textBox.left >= box.left - 1 && textBox.right <= box.right + 1, `${label}: caption outside bubble`)
      if (index > 0) check(textBox.height > parseFloat(getComputedStyle(text).lineHeight) * 1.5, `${label}: caption did not wrap`)
      const metadata = visual.querySelector<HTMLElement>('[data-slot="message-metadata"]')!
      const meta = metadata.getBoundingClientRect()
      check(!!metadata.querySelector('time') && meta.left >= image.left - 1 && meta.right <= image.right + 1 && meta.top >= image.top - 1 && meta.bottom <= image.bottom + 1, `${label}: metadata outside visual`)
      if (error) {
        const alert = frame.querySelector<HTMLElement>('[role="alert"]')!
        const retry = [...alert.querySelectorAll('button')].find(button => button.textContent?.includes('Tentar novamente'))
        check(!!retry && !retry.disabled, `${label}: accessible retry missing`)
        check(alert.scrollWidth <= alert.clientWidth + 1, `${label}: error overflows`)
      }
    }
    check(Math.max(...widths) - Math.min(...widths) <= 1, `${scenario}: caption changed bubble widths ${widths.join(', ')}`)
  }
  let finishDownload: (() => void) | undefined
  let calls = 0
  api.defaults.adapter = async config => {
    calls++
    await new Promise<void>(resolve => { finishDownload = resolve })
    return { config, status: 200, statusText: 'OK', headers: {}, data: new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="green"/></svg>'], { type: 'image/svg+xml' }) }
  }
  const message = { ...original, media: { ...original.media!, thumbnail: { mimeType: 'image/jpeg' as const, base64: mockThumbnailBase64, width: 80, height: 60 } } }
  root.render(<main className="p-4"><ul><MessageBubble key="pending-preview" message={message} onOpenMedia={() => {}} /></ul></main>)
  await wait(() => calls > 0 && document.querySelector('img')?.naturalWidth === 80, 'pending preview')
  const visual = document.querySelector<HTMLElement>('[data-slot="message-media-visual"]')!
  const preview = visual.querySelector('img')!
  const before = visual.getBoundingClientRect()
  check(before.width > 100 && before.height > 75, `preview too small: ${before.width}x${before.height}`)
  check(before.right <= innerWidth + 1, 'preview outside viewport')
  check(preview.alt.length > 0, 'preview missing accessible description')
  const spinner = [...visual.querySelectorAll<SVGElement>('svg')].find(icon => getComputedStyle(icon).animationName !== 'none')
  check(!!spinner, 'loading spinner missing over preview')
  if (spinner) {
    const box = spinner.getBoundingClientRect()
    check(Math.abs(box.left + box.width / 2 - (before.left + before.width / 2)) <= 2 && Math.abs(box.top + box.height / 2 - (before.top + before.height / 2)) <= 2, 'spinner not centered over preview')
  }
  check(!!visual.querySelector('button[aria-label="Abrir imagem na galeria"]'), 'gallery button inaccessible while loading')
  finishDownload!()
  await wait(() => visual.querySelector('img')?.naturalWidth === 800, 'full image loaded')
  const after = visual.getBoundingClientRect()
  check(Math.abs(before.width - after.width) <= 1 && Math.abs(before.height - after.height) <= 1, `image shifted from ${before.width}x${before.height} to ${after.width}x${after.height}`)
  check(![...visual.querySelectorAll<SVGElement>('svg')].some(icon => getComputedStyle(icon).animationName !== 'none'), 'spinner remained after loading')

  root.unmount()
  document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
