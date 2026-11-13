import { QueryClient } from '@tanstack/react-query'
import type { AxiosAdapter } from 'axios'
import { createStore, Provider } from 'jotai'
import { queryClientAtom } from 'jotai-tanstack-query'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { chatLiveCacheAtom, chatSessionStateAtom } from '../../src/atoms/chat-cache'
import { chatSessionIdAtom } from '../../src/atoms/ui'
import ConversationAvatar from '../../src/components/chat/conversation-avatar'
import { api } from '../../src/lib/api-client'
import { isAvatarExpired } from '../../src/lib/chat/avatar'
import { mockConversations, mockSessionId } from './mock-data'

;(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true
const callbacks = new Map<Element, IntersectionObserverCallback>()
class Observer {
  private elements = new Set<Element>()
  constructor(private callback: IntersectionObserverCallback) {}
  observe(element: Element) {
    this.elements.add(element)
    callbacks.set(element, this.callback)
  }
  disconnect() {
    for (const element of this.elements) callbacks.delete(element)
    this.elements.clear()
  }
  unobserve(element: Element) {
    this.elements.delete(element)
    callbacks.delete(element)
  }
}
Object.defineProperty(globalThis, 'IntersectionObserver', { value: Observer, configurable: true })
const store = createStore()
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})
store.set(queryClientAtom, client)
store.set(chatSessionIdAtom, mockSessionId)
store.set(chatSessionStateAtom, { connected: false, enabled: true, syncStatus: 'idle' })
const base = mockConversations[0]
if (!base?.contact) throw new Error('Missing contact fixture')
const contact = base.contact
const checkedAt = new Date().toISOString()
const stale = {
  ...base,
  contact: { ...contact, avatarCheckedAt: new Date(Date.now() - 3_600_001).toISOString() },
}
const fresh = {
  ...base,
  contact: {
    ...contact,
    id: '00000000-0000-4000-8000-000000000099',
    avatarUrl: null,
    avatarCheckedAt: checkedAt,
  },
}
const failed = {
  ...base,
  avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  contact: { ...contact, id: '00000000-0000-4000-8000-000000000098', avatarCheckedAt: null },
}
let failRequest = false
let releaseRequest: (() => void) | undefined
const gate = new Promise<void>((resolve) => {
  releaseRequest = resolve
})
const requests: string[] = []
api.defaults.adapter = (async (config) => {
  requests.push(`${config.method}:${config.url}`)
  if (failRequest) throw new Error('unavailable')
  await gate
  return {
    config,
    status: 200,
    statusText: 'OK',
    headers: {},
    data: {
      status: 'success',
      data: {
        ...contact,
        avatarUrl: null,
        avatarCheckedAt: checkedAt,
        revision: contact.revision + 1,
      },
    },
  }
}) satisfies AxiosAdapter
window.fetch = () => Promise.reject(new Error('Unexpected network request'))
const host = document.createElement('div')
document.body.append(host)
const root = createRoot(host)
const check = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message)
}
async function render(showStale = true) {
  await act(async () => {
    root.render(
      <Provider store={store}>
        {showStale && (
          <>
            <div id="stale">
              <ConversationAvatar conversation={stale} />
            </div>
            <div id="duplicate">
              <ConversationAvatar conversation={stale} />
            </div>
          </>
        )}
        <div id="fresh">
          <ConversationAvatar conversation={fresh} />
        </div>
        <div id="failed">
          <ConversationAvatar conversation={failed} />
        </div>
      </Provider>,
    )
  })
}
async function visible(id: string) {
  const element = document.querySelector(`#${id} > span`)
  if (!element) throw new Error(`Missing ${id} avatar`)
  const callback = callbacks.get(element)
  if (!callback) throw new Error(`Missing ${id} observer`)
  await act(async () => {
    callback(
      [{ target: element, isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    )
    await Promise.resolve()
  })
}
async function run() {
  const now = Date.parse('2026-01-01T12:00:00.000Z')
  check(
    !isAvatarExpired(new Date(now - 3_599_999).toISOString(), now),
    'timestamp younger than one hour expired',
  )
  check(
    isAvatarExpired(new Date(now - 3_600_000).toISOString(), now),
    'timestamp exactly one hour old did not expire',
  )
  check(
    isAvatarExpired(new Date(now - 3_600_001).toISOString(), now),
    'timestamp older than one hour did not expire',
  )
  check(isAvatarExpired(null, now), 'missing timestamp did not expire')
  await render()
  check(requests.length === 0, 'invisible cards requested avatars')
  await visible('stale')
  check(requests.length === 0, 'disconnected session requested avatar')
  await act(async () => {
    store.set(chatSessionStateAtom, { connected: true, enabled: true, syncStatus: 'idle' })
  })
  check(requests.length === 1, 'visible stale avatar did not request exactly once')
  check(requests[0]?.endsWith(`/contacts/${contact.id}/avatar`), 'wrong contact requested')
  await visible('duplicate')
  check(requests.length === 1, 'concurrent visible cards did not share their in-flight request')
  await act(async () => {
    releaseRequest?.()
    await gate
    await Promise.resolve()
  })
  await visible('fresh')
  check(requests.length === 1, 'fresh null avatar requested again')
  await render()
  check(requests.length === 1, 'rerender repeated avatar request')
  const updated = store.get(chatLiveCacheAtom).contacts.find((item) => item.id === contact.id)
  check(
    updated?.avatarCheckedAt === checkedAt && updated.avatarUrl === null,
    'updated contact timestamp not merged into live cache',
  )
  await render(false)
  check(
    !document.querySelector('#stale') && !document.querySelector('#duplicate'),
    'stale cards did not unmount',
  )
  await render()
  await visible('stale')
  await visible('duplicate')
  check(requests.length === 1, 'remounted stale props ignored the newer live cache')
  failRequest = true
  const failedCard = document.querySelector('#failed')
  check(failedCard, 'missing failed card')
  for (let attempt = 0; attempt < 50 && !failedCard?.querySelector('img'); attempt++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
  }
  const oldImage = failedCard?.querySelector('img')?.getAttribute('src')
  check(oldImage === failed.avatarUrl, 'previous avatar did not render')
  await visible('failed')
  check(requests.length === 2, 'visible stale failure did not send a request')
  await render()
  check(requests.length === 2, 'failed avatar retried on rerender')
  check(
    failedCard?.querySelector('span[title="Não foi possível atualizar a foto de perfil"]'),
    'failure state not rendered',
  )
  check(
    failedCard?.querySelector('img')?.getAttribute('src') === oldImage,
    'failure removed the previous avatar',
  )
  check(
    !store.get(chatLiveCacheAtom).contacts.some((item) => item.id === failed.contact.id),
    'failed avatar changed cache',
  )
  await act(async () => root.unmount())
  client.clear()
  document.body.textContent = 'ok'
}
run().catch((error) => {
  document.body.textContent = `ERROR: ${String(error)}`
})
