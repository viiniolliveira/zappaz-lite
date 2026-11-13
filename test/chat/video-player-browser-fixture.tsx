import { createRoot } from 'react-dom/client'
import { VideoPlayerPro } from '../../src/components/ruixen/video-player-pro'

let paused = true
let rejected = false
let pauses = 0
let retries = 0
Object.defineProperty(HTMLMediaElement.prototype, 'paused', { configurable: true, get: () => paused })
Object.defineProperty(HTMLMediaElement.prototype, 'duration', { configurable: true, get: () => 60 })
HTMLMediaElement.prototype.play = function () { if (rejected) return Promise.reject(new DOMException('blocked', 'NotAllowedError')); paused = false; this.dispatchEvent(new Event('play')); return Promise.resolve() }
HTMLMediaElement.prototype.pause = function () { pauses++; paused = true; this.dispatchEvent(new Event('pause')) }
HTMLMediaElement.prototype.load = function () {}
const wait = async (condition: () => boolean, label: string) => { for (let i = 0; i < 100; i++) { if (condition()) return; await new Promise(resolve => setTimeout(resolve, 20)) } throw new Error(label) }
const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
const check = (value: unknown, label: string) => { if (!value) throw new Error(label) }
async function run() {
  document.addEventListener('error', event => { if (event.isTrusted && event.target instanceof HTMLMediaElement) event.stopImmediatePropagation() }, true)
  window.fetch = () => Promise.reject(new Error('network forbidden'))
  const root = createRoot(document.getElementById('root')!)
  const render = (src: string) => root.render(<VideoPlayerPro src={src} onRetry={() => { retries++ }} />)
  render('data:video/mp4;base64,')
  await wait(() => !!document.querySelector('video'), 'mount')
  let video = document.querySelector('video')!
  video.dispatchEvent(new Event('loadedmetadata'))
  const player = document.querySelector<HTMLElement>('[data-slot=video-player-pro]')!
  const key = (key: string) => player.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
  const range = document.querySelector<HTMLInputElement>('input[aria-label="Posição do vídeo"]')!
  await wait(() => !range.disabled && range.max === "60", "metadata")
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  valueSetter.call(range, '20'); range.dispatchEvent(new Event('input', { bubbles: true }))
  await wait(() => video.currentTime === 20, 'range seek')
  await frames()
  check(player.getBoundingClientRect().width === 320, 'compact player width')
  await wait(() => !!document.querySelector('select[aria-label="Velocidade do vídeo"]'), 'compact speed control')
  const speed = document.querySelector<HTMLSelectElement>('select[aria-label="Velocidade do vídeo"]')!
  speed.value = '1.5'; speed.dispatchEvent(new Event('change', { bubbles: true }))
  await wait(() => video.playbackRate === 1.5, 'compact speed')
  player.style.width = '600px'
  await frames()
  await wait(() => !!document.querySelector('button[aria-label="Velocidade 2x"]'), 'desktop speed controls')
  check(player.getBoundingClientRect().width === 600, 'desktop player width')
  check(!document.querySelector('select[aria-label="Velocidade do vídeo"]'), 'desktop uses speed pills')
  document.querySelector<HTMLButtonElement>('button[aria-label="Velocidade 2x"]')!.click()
  await wait(() => video.playbackRate === 2 && document.querySelector('button[aria-label="Velocidade 2x"]')?.getAttribute('aria-pressed') === 'true', 'desktop speed')
  player.requestFullscreen = () => Promise.reject(new Error('denied'))
  key('f'); await wait(() => !!document.querySelector('[role=status]')?.textContent?.includes('Não foi possível ativar'), 'fullscreen rejection')
  key('k'); await wait(() => !paused, 'play')
  key('ArrowRight'); await wait(() => video.currentTime === 25, 'seek')
  key('m'); await wait(() => video.muted, 'mute')
  key('m'); await wait(() => !video.muted && video.volume === 1, 'restore volume')
  key('k'); await wait(() => paused, 'pause')
  rejected = true; key('k')
  await wait(() => !!document.querySelector('[role=alert]')?.textContent?.includes('bloqueou'), 'play rejection')
  Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Tentar novamente')!.click()
  await wait(() => retries === 1, 'retry')
  render('data:video/webm;base64,')
  await wait(() => document.querySelector('video') !== video, 'source change')
  check(pauses >= 2, 'old video must be paused on source change')
  video = document.querySelector('video')!
  check(video.getAttribute('src') === 'data:video/webm;base64,', 'new source')
  root.unmount(); document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
