import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useDebounce } from '../../src/hooks/use-debounce'

;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const originalSetTimeout = window.setTimeout
const originalClearTimeout = window.clearTimeout
let clock = 0
let nextId = 0
const timers = new Map<number, { at: number; callback: () => void }>()
window.setTimeout = ((callback: TimerHandler, delay = 0) => {
  if (typeof callback !== 'function') throw Error('Expected function timer')
  const id = ++nextId
  timers.set(id, { at: clock + delay, callback: () => callback() })
  return id
}) as typeof window.setTimeout
window.clearTimeout = id => { timers.delete(id) }
async function advance(ms: number) {
  const target = clock + ms
  await act(async () => {
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0]
      if (!next) break
      timers.delete(next[0]); clock = next[1].at; next[1].callback()
    }
    clock = target
  })
}
function expect(condition: unknown, message: string): asserts condition { if (!condition) throw Error(message) }
const root = createRoot(document.getElementById('root')!)
let rendered = ''
let renders = 0
function Probe({ value, delay }: { value: string; delay?: number }) { rendered = useDebounce(value, delay); renders++; return null }
async function render(value: string, delay?: number) { await act(async () => root.render(createElement(Probe, { value, delay }))) }
const results: { name: string; ok: boolean; error?: string }[] = []
async function check(name: string, fn: () => Promise<void>) { try { await fn(); results.push({ name, ok: true }) } catch (error) { results.push({ name, ok: false, error: String(error) }) } }
await check('initial value and default 500ms trailing update', async () => {
  await render('initial'); expect(rendered === 'initial', 'initial value is not immediate')
  await render('first'); await advance(499); expect(rendered === 'initial', 'default delay fired early')
  await advance(1); expect(rendered === 'first', 'default delay did not fire')
})
await check('new values cancel the previous timer', async () => {
  await render('a'); await advance(300); await render('ab'); await advance(200)
  expect(rendered === 'first', 'cancelled value was emitted')
  await advance(299); expect(rendered === 'first', 'latest value fired early')
  await advance(1); expect(rendered === 'ab', 'latest value not emitted')
})
await check('custom delay and changed delay', async () => {
  await render('custom', 200); await advance(199); expect(rendered === 'ab', 'custom delay fired early')
  await advance(1); expect(rendered === 'custom', 'custom delay did not fire')
  await render('changed', 500); await advance(100); await render('changed', 200)
  await advance(199); expect(rendered === 'custom', 'changed delay fired early')
  await advance(1); expect(rendered === 'changed', 'changed delay not respected')
})
await check('unmount cancels pending update', async () => {
  await render('pending'); const before = renders
  expect(timers.size > 0, 'missing pending timer')
  await act(async () => root.unmount())
  expect(timers.size === 0, 'timer retained after unmount')
  await advance(1000); expect(renders === before, 'render occurred after unmount')
})
window.setTimeout = originalSetTimeout
window.clearTimeout = originalClearTimeout
document.body.textContent = JSON.stringify(results)
