import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import MessageHistory from '../../src/components/chat/message-history'
import { mockMessage } from './mock-data'

const messages = Array.from({ length: 20 }, (_, i) => mockMessage(i + 1, '00000000-0000-4000-8000-000000000001', { type: 'text', text: `Mensagem ${i}` }))
const older = Array.from({ length: 5 }, (_, i) => mockMessage(100 + i, '00000000-0000-4000-8000-000000000001', { type: 'text', text: `Anterior ${i}` }))
function Fixture() {
  const [conversation, setConversation] = useState('00000000-0000-4000-8000-000000000001')
  const [items, setItems] = useState(messages)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [scrollRequest, setScrollRequest] = useState(0)
  return <><button id="send" onClick={() => setScrollRequest(value => value + 1)}>send</button><button id="load" onClick={() => setLoading(false)}>load</button><button id="switch" onClick={() => setConversation('00000000-0000-4000-8000-000000000002')}>switch</button><MessageHistory scrollToBottomRequest={scrollRequest} conversationId={conversation} displayName="Contato" messages={loading ? [] : items} loading={loading} hasOlder loadingOlder={loadingOlder} onLoadOlder={async () => { setLoadingOlder(true); await new Promise(resolve => setTimeout(resolve, 50)); setItems(current => [...older, ...current]); setLoadingOlder(false) }} /></>
}
const wait = async (predicate: () => boolean, label: string) => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 20)) } throw new Error(label) }
const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
async function run() {
  window.fetch = () => Promise.reject(new Error('network forbidden'))
  const root = createRoot(document.getElementById('root')!)
  root.render(<Fixture />)
  await wait(() => !!document.querySelector('section[aria-label^="Histórico de "]'), 'mount')
  const history = document.querySelector<HTMLElement>('section[aria-label^="Histórico de "]')!
  document.getElementById('load')!.click()
  await wait(() => !history.querySelector('[role=status]') && history.scrollHeight > 400 && history.scrollTop > 0, 'async load follows bottom')
  const bottom = () => history.scrollHeight - history.clientHeight - history.scrollTop
  check(bottom() <= 1, 'initial bottom')
  await frames()
  const content = history.firstElementChild as HTMLElement
  const image = new Image()
  image.src = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="250"></svg>')}`
  await image.decode()
  const previousTop = history.scrollTop
  content.append(image)
  check(history.scrollTop === previousTop && bottom() > 100, 'image growth preserves the previous scroll position before notification')
  history.dispatchEvent(new Event('scroll'))
  await frames()
  check(Math.abs(bottom()) <= 1, 'queued programmatic scroll after image growth must keep following')
  const loadImage = async (height: number) => {
    const delayed = new Image()
    content.append(delayed)
    delayed.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="${height}"></svg>`)}`
    await delayed.decode()
    await frames()
    return delayed
  }
  const firstWave = await loadImage(180)
  check(firstWave.naturalHeight === 180 && Math.abs(bottom()) <= 1, 'first delayed image follows bottom')
  const secondWave = await loadImage(220)
  check(secondWave.naturalHeight === 220 && Math.abs(bottom()) <= 1, 'second delayed image follows bottom')
  history.style.height = '120px'
  await frames()
  check(Math.abs(bottom()) <= 1, 'shrinking viewport follows bottom')
  history.style.height = '240px'
  await frames()
  check(Math.abs(bottom()) <= 1, 'growing viewport follows bottom')
  history.scrollTop = 100
  await frames()
  const manualTop = history.scrollTop
  await loadImage(200)
  check(history.scrollTop === manualTop && bottom() > 100, 'delayed image must not override manual scroll')
  history.style.height = '160px'
  await frames()
  check(history.scrollTop === manualTop && bottom() > 100, 'viewport resize must not reattach after manual scroll')
  document.getElementById('send')!.click()
  await frames()
  check(Math.abs(bottom()) <= 1, 'send reattaches after manual scroll')
  await loadImage(160)
  check(Math.abs(bottom()) <= 1, 'delayed image follows after send reattaches')
  history.style.height = '200px'
  await frames()
  const growth = document.createElement('div'); growth.style.height = '250px'; content.append(growth)
  await frames()
  check(Math.abs(bottom()) <= 1, 'late media growth follows bottom')
  history.scrollTop = 100; await frames()
  const before = history.scrollTop
  growth.style.height = '500px'
  await frames()
  check(history.scrollTop === before, 'user scrolling up must disable following')
  const height = history.scrollHeight
  Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Carregar mensagens anteriores')!.click()
  await wait(() => history.scrollHeight > height && !!document.body.textContent?.includes('Anterior 0'), 'prepend')
  await wait(() => Math.abs(history.scrollTop - (before + history.scrollHeight - height)) <= 1, 'prepend anchor')
  history.scrollTop = 100; await frames()
  const heightBeforeSend = history.scrollHeight
  Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'Carregar mensagens anteriores')!.click()
  document.getElementById('send')!.click()
  await wait(() => history.scrollHeight > heightBeforeSend, 'prepend after send')
  await frames(); check(bottom() <= 1, 'send during pagination must discard old anchor')
  document.getElementById('switch')!.click()
  await wait(() => bottom() <= 1, 'conversation resets follow')
  root.unmount(); document.body.textContent = 'ok'
}
run().catch(error => { document.body.textContent = `FAIL: ${String(error)}` })
