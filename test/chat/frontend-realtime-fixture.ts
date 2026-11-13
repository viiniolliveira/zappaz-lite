import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { QueryClient, QueryObserver } from '@tanstack/react-query'
import { createStore } from 'jotai/vanilla'
import { queryClientAtom } from 'jotai-tanstack-query'

const notifications: string[] = []
mock.module('sonner', () => ({
  toast: {
    success: (text: string) => notifications.push(text),
    error: (text: string) => notifications.push(text),
    dismiss: () => {},
  },
}))

const sessionId = '11111111-1111-4111-8111-111111111111'
const foreign = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const handlers = new Map<string, Array<(...args: never[]) => void>>()
const emitted: Array<{ event: string; payload: unknown }> = []
let ack: ((error: Error | null, value: unknown) => void) | undefined
let presenceAck: ((error: Error | null, value: unknown) => void) | undefined
let logsAck: ((error: Error | null, value: unknown) => void) | undefined
let autoSubscribe = false
let connects = 0
let disconnects = 0
let removed = 0
let options: unknown
let snapshots = 0
let recoverySnapshot: ((cursor: string | undefined) => Promise<unknown>) | undefined
let recoveryMessages: ((before: string | undefined) => Promise<unknown>) | undefined
const managerHandlers = new Map<string, () => void>()
const socket = {
  io: {
    on(event: string, fn: () => void) {
      managerHandlers.set(event, fn)
      return this
    },
    off(event: string, fn: () => void) {
      if (managerHandlers.get(event) === fn) managerHandlers.delete(event)
      return this
    },
  },
  connected: false,
  on(event: string, fn: (...args: never[]) => void) {
    handlers.set(event, [...(handlers.get(event) ?? []), fn])
    return this
  },
  off(event: string, fn: (...args: never[]) => void) {
    const remaining = (handlers.get(event) ?? []).filter((item) => item !== fn)
    if (remaining.length) handlers.set(event, remaining)
    else handlers.delete(event)
    return this
  },
  emit(event: string, payload: unknown, callback?: (error: Error | null, value: unknown) => void) {
    emitted.push({ event, payload })
    if (callback) {
      if (event === 'chat.presence.subscribe') presenceAck = callback
      else if (event === 'logs.subscribe') logsAck = callback
      else if (event === 'chat.session.subscribe' && autoSubscribe)
        callback(null, { ok: true, data: { sessionId, subscribed: true } })
      else ack = callback
    }
    return this
  },
  timeout(ms: number) {
    assert.equal(ms, 5000)
    return this
  },
  connect() {
    connects++
    return this
  },
  disconnect() {
    disconnects++
    this.connected = false
    return this
  },
  removeAllListeners() {
    removed++
    handlers.clear()
    return this
  },
}
mock.module('socket.io-client', () => ({
  io: (_url: string, opts: unknown) => {
    options = opts
    return socket
  },
}))
mock.module('../../src/services/chat.ts', () => ({
  getChatConversations: async (_session: string, params: { cursor?: string }) => {
    snapshots++
    if (recoverySnapshot) return recoverySnapshot(params.cursor)
    return { status: 'success', data: [], page: { nextCursor: null, hasMore: false } }
  },
  getChatMessages: async (_session: string, _conversation: string, params: { before?: string }) => {
    if (recoveryMessages) return recoveryMessages(params.before)
    throw new Error('unexpected messages request')
  },
  getChatConversation: async () => {
    throw new Error('unexpected conversation request')
  },
}))
const win = Object.assign(new EventTarget(), { location: { origin: 'http://example.test' } })
const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' })
Object.assign(globalThis, { window: win, document: doc })
const { chatPresenceEffectAtom, realtimeChatEffectAtom } = await import(
  '../../src/atoms/realtime-chat.ts'
)
const { realtimeAppEffectAtom } = await import('../../src/atoms/realtime-app.ts')
const cache = await import('../../src/atoms/chat-cache.ts')
const ui = await import('../../src/atoms/ui.ts')
const { mockMessage, mockConversations } = await import('./mock-data.ts')
const store = createStore()
const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
const invalidations: unknown[] = []
const invalidate = client.invalidateQueries.bind(client)
client.invalidateQueries = (filters, opts) => {
  invalidations.push(filters)
  return invalidate(filters, opts)
}
store.set(queryClientAtom, client)
store.set(ui.chatSessionIdAtom, sessionId)
const fire = (event: string, ...args: unknown[]) => {
  for (const fn of handlers.get(event) ?? []) (fn as (...values: unknown[]) => void)(...args)
}
const connect = () => {
  socket.connected = true
  fire('connect')
}
const success = () => {
  assert.ok(ack)
  ack(null, { ok: true, data: { sessionId, subscribed: true } })
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const stopApp = store.sub(realtimeAppEffectAtom, () => {})
const stop = store.sub(realtimeChatEffectAtom, () => {})
const scenario = process.argv[2]

if (scenario === 'subscription') {
  assert.deepEqual(options, {
    path: '/api/ws',
    transports: ['websocket'],
    withCredentials: true,
    autoConnect: false,
  })
  assert.equal(connects, 1)
  assert.ok(handlers.size > 0)
  const stopQuery = store.sub(cache.chatConversationPagesAtom, () => {})
  await tick()
  assert.equal(snapshots, 0)
  connect()
  assert.equal(store.get(cache.chatSubscribedAtom), false)
  assert.equal(snapshots, 0)
  success()
  await tick()
  assert.equal(store.get(cache.chatSubscribedAtom), true)
  assert.ok(snapshots > 0)
  assert.equal(
    invalidations.filter(
      (item) =>
        JSON.stringify(item) ===
        JSON.stringify({ queryKey: cache.chatKeys.session(sessionId), refetchType: 'none' }),
    ).length,
    1,
  )
  for (let i = 0; i < 100 && client.isFetching(); i++) await tick()
  await tick()
  assert.equal(
    emitted.filter((item) => item.event === 'chat.session.subscribe').length,
    1,
    'initial subscription count',
  )
  socket.connected = false
  fire('disconnect')
  assert.equal(store.get(cache.chatSubscribedAtom), false)
  managerHandlers.get('reconnect_attempt')?.()
  assert.equal(store.get(cache.chatConnectionStatusAtom), 'connecting')
  connect()
  success()
  await tick()
  assert.equal(
    emitted.filter((item) => item.event === 'chat.session.subscribe').length,
    2,
    JSON.stringify(emitted),
  )
  assert.equal(
    invalidations.filter(
      (item) =>
        JSON.stringify(item) ===
        JSON.stringify({ queryKey: cache.chatKeys.session(sessionId), refetchType: 'none' }),
    ).length,
    2,
  )
  stopQuery()
} else if (scenario === 'presence-subscription') {
  const stopPresence = store.sub(chatPresenceEffectAtom, () => {})
  const first = mockConversations[0].id
  const second = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const requests = () => emitted.filter((item) => item.event === 'chat.presence.subscribe')
  store.set(ui.selectedChatIdAtom, first)
  assert.equal(requests().length, 0)
  connect()
  success()
  assert.equal(requests().length, 0)
  const state = { connected: true, enabled: true, syncStatus: 'idle' as const }
  store.set(cache.chatSessionStateAtom, state)
  assert.deepEqual(
    requests().map((item) => item.payload),
    [{ sessionId, conversationId: first }],
  )
  assert.ok(presenceAck)
  presenceAck(null, { ok: true })
  store.set(cache.chatSessionStateAtom, { ...state, syncStatus: 'syncing' })
  assert.equal(requests().length, 1)
  store.set(ui.selectedChatIdAtom, second)
  assert.deepEqual(requests().at(-1)?.payload, { sessionId, conversationId: second })
  assert.equal(requests().length, 2)
  assert.equal(emitted.filter((item) => item.event === 'chat.session.subscribe').length, 1)
  assert.ok(presenceAck)
  presenceAck(null, { ok: false })
  assert.deepEqual(notifications, ['Não foi possível acompanhar a digitação desta conversa.'])
  store.set(cache.chatSessionStateAtom, { ...state, connected: false })
  assert.equal(requests().length, 2)
  store.set(cache.chatSessionStateAtom, state)
  assert.equal(requests().length, 3)
  socket.connected = false
  fire('disconnect')
  assert.equal(requests().length, 3)
  connect()
  success()
  assert.equal(requests().length, 4)
  store.set(ui.selectedChatIdAtom, null)
  socket.connected = false
  fire('disconnect')
  connect()
  success()
  assert.equal(requests().length, 4)
  store.set(ui.selectedChatIdAtom, first)
  assert.equal(requests().length, 5)
  assert.ok(presenceAck)
  const stale = presenceAck
  stopPresence()
  stale(new Error('late timeout'), undefined)
  assert.equal(notifications.length, 1)
  assert.ok(
    emitted.every((item) =>
      ['chat.presence.subscribe', 'chat.session.subscribe', 'chat.session.unsubscribe'].includes(
        item.event,
      ),
    ),
  )
} else if (scenario === 'late-ack') {
  connect()
  assert.ok(ack)
  const oldAck = ack
  socket.connected = false
  fire('disconnect')
  oldAck(null, { ok: true, data: { sessionId, subscribed: true } })
  assert.equal(store.get(cache.chatSubscribedAtom), false)
  assert.equal(store.get(cache.chatConnectionStatusAtom), 'closed')
  connect()
  oldAck(null, { ok: false, error: { code: 'FORBIDDEN', message: 'stale' } })
  assert.equal(store.get(cache.chatAccessDeniedAtom), false)
  success()
  assert.equal(store.get(cache.chatSubscribedAtom), true)
} else if (scenario === 'errors') {
  connect()
  assert.ok(ack)
  ack(new Error('timeout'), undefined)
  assert.equal(store.get(cache.chatSubscribedAtom), false)
  assert.equal(store.get(cache.chatConnectionStatusAtom), 'error')
  assert.equal(disconnects, 0)
  connect()
  assert.ok(ack)
  ack(null, { ok: true, data: { sessionId: foreign, subscribed: true } })
  assert.equal(store.get(cache.chatSubscribedAtom), false)
  assert.equal(store.get(cache.chatConnectionStatusAtom), 'error')
} else if (scenario === 'events') {
  connect()
  success()
  const base = mockMessage(1, mockConversations[0].id)
  const event = (id: number, message: typeof base, outerSession = sessionId) => ({
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    occurredAt: '2026-10-31T12:00:00.000Z',
    sessionId: outerSession,
    data: { message, source: 'live' },
  })
  fire('chat.message.upserted', event(1, { ...base, revision: 3, text: 'new' }))
  fire('chat.message.upserted', event(2, { ...base, revision: 2, text: 'old' }))
  fire('chat.message.upserted', event(3, { ...base, revision: 4, text: 'foreign' }, foreign))
  fire('chat.message.upserted', event(4, { ...base, sessionId: foreign, revision: 5 }))
  fire('chat.message.upserted', event(1, { ...base, revision: 6, text: 'duplicate' }))
  fire('chat.message.upserted', { invalid: true })
  assert.deepEqual(store.get(cache.chatLiveCacheAtom).messages, [
    { ...base, revision: 3, text: 'new' },
  ])
  const syncEvent = (id: number, phase: string) => ({
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    occurredAt: '2026-10-31T12:00:00.000Z',
    sessionId,
    data: {
      sessionId,
      connected: true,
      enabled: true,
      syncStatus: phase === 'complete' ? 'idle' : 'syncing',
      syncProgress: { phase, messages: 150, contacts: 10, conversations: 3 },
    },
  })
  fire('chat.session.state', syncEvent(10, 'saving'))
  assert.equal(store.get(cache.chatSessionStateAtom)?.syncProgress?.messages, 150)
  fire('chat.session.state', syncEvent(11, 'complete'))
  fire('chat.session.state', syncEvent(12, 'complete'))
  assert.equal(store.get(cache.chatSessionStateAtom)?.syncProgress?.phase, 'complete')
  assert.deepEqual(notifications, [])
} else if (scenario === 'typing') {
  const { chatTypingAtom } = await import('../../src/atoms/chat-typing.ts')
  const conversationId = mockConversations[0].id
  const otherConversationId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const key = `${sessionId}/${conversationId}`
  const otherKey = `${sessionId}/${otherConversationId}`
  let eventId = 100
  const envelope = (data: unknown, scope = sessionId) => ({
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(eventId++).padStart(12, '0')}`,
    occurredAt: new Date().toISOString(),
    sessionId: scope,
    data,
  })
  fire('chat.typing', envelope({ conversationId }))
  assert.deepEqual(store.get(chatTypingAtom), {})
  connect()
  success()
  fire('chat.typing', { invalid: true })
  fire('chat.typing', envelope({ conversationId }, foreign))
  assert.deepEqual(store.get(chatTypingAtom), {})
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  let clock = 0
  let timerId = 0
  const timers = new Map<number, { at: number; run: () => void }>()
  globalThis.setTimeout = ((run: () => void, delay: number) => {
    if (delay !== 5000) return realSetTimeout(run, delay)
    const id = ++timerId
    timers.set(id, { at: clock + delay, run })
    return id
  }) as typeof setTimeout
  globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
    if (typeof id === 'number' && timers.has(id)) timers.delete(id)
    else realClearTimeout(id)
  }) as typeof clearTimeout
  const advance = (ms: number) => {
    clock += ms
    for (const [id, timer] of timers) {
      if (timer.at > clock) continue
      timers.delete(id)
      timer.run()
    }
  }
  try {
    const typing = envelope({ conversationId })
    fire('chat.typing', typing)
    assert.equal(store.get(chatTypingAtom)[key], true)
    advance(4000)
    fire('chat.typing', typing)
    advance(1000)
    assert.equal(store.get(chatTypingAtom)[key], undefined)
    fire('chat.typing', envelope({ conversationId }))
    advance(4000)
    fire('chat.typing', envelope({ conversationId }))
    advance(4999)
    assert.equal(store.get(chatTypingAtom)[key], true)
    advance(1)
    assert.equal(store.get(chatTypingAtom)[key], undefined)
    fire('chat.typing', envelope({ conversationId }))
    fire('chat.typing', envelope({ conversationId: otherConversationId }))
    const base = { ...mockMessage(1, conversationId), fromMe: false }
    fire('chat.message.upserted', envelope({ message: { ...base, fromMe: true }, source: 'send' }))
    fire('chat.message.upserted', envelope({ message: base, source: 'history' }))
    fire(
      'chat.message.upserted',
      envelope({ message: { ...base, sessionId: foreign }, source: 'live' }),
    )
    assert.equal(store.get(chatTypingAtom)[key], true)
    fire('chat.message.upserted', envelope({ message: base, source: 'live' }))
    assert.equal(store.get(chatTypingAtom)[key], undefined)
    assert.equal(store.get(chatTypingAtom)[otherKey], true)
    socket.connected = false
    fire('disconnect')
    assert.deepEqual(store.get(chatTypingAtom), {})
    assert.equal(timers.size, 0)
    connect()
    success()
    fire('chat.typing', envelope({ conversationId }))
    fire(
      'chat.conversation.deleted',
      envelope({ conversationId, deletedAt: new Date().toISOString() }),
    )
    fire('chat.typing', envelope({ conversationId }))
    assert.deepEqual(store.get(chatTypingAtom), {})
    assert.equal(timers.size, 0)
    fire('chat.typing', envelope({ conversationId: otherConversationId }))
    fire('chat.session.revoked', { sessionId })
    assert.deepEqual(store.get(chatTypingAtom), {})
    assert.equal(timers.size, 0)
    store.set(cache.chatAccessDeniedAtom, false)
    connect()
    success()
    fire('chat.typing', envelope({ conversationId: otherConversationId }))
    store.set(ui.chatSessionIdAtom, foreign)
    assert.deepEqual(store.get(chatTypingAtom), {})
    assert.equal(timers.size, 0)
    assert.ok(
      emitted.every((item) =>
        ['chat.session.subscribe', 'chat.session.unsubscribe'].includes(item.event),
      ),
    )
  } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  }
} else if (scenario === 'visibility') {
  connect()
  success()
  const target = { ...mockConversations[0], lastMessage: null, revision: 1 }
  const message = mockMessage(1, target.id)
  const envelope = (id: number, conversation: typeof target) => ({
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    occurredAt: '2026-10-31T12:00:00.000Z',
    sessionId,
    data: { conversation },
  })
  store.set(cache.applyChatConversationsAtom, [target])
  store.set(ui.selectedChatIdAtom, target.id)
  for (const localStatus of ['sending', 'failed'] as const) {
    store.set(cache.chatOptimisticMessagesAtom, [{ ...message, localStatus }])
    assert.equal(store.get(cache.visibleChatConversationsAtom).length, 0)
    assert.equal(store.get(cache.apiChatConversationsAtom)[0]?.id, target.id)
    assert.equal(store.get(ui.selectedChatIdAtom), target.id)
  }
  fire('chat.conversation.upserted', envelope(20, { ...target, revision: 2, lastMessage: message }))
  assert.deepEqual(
    store.get(cache.visibleChatConversationsAtom).map((item) => item.id),
    [target.id],
  )
  store.set(cache.chatOptimisticMessagesAtom, [])
  store.set(cache.applyChatMessagesAtom, [message])
  fire('chat.conversation.upserted', envelope(21, { ...target, revision: 3 }))
  assert.equal(store.get(cache.visibleChatConversationsAtom).length, 0)
  assert.equal(store.get(cache.apiChatConversationsAtom)[0]?.messages.length, 1)
  assert.equal(store.get(ui.selectedChatIdAtom), target.id)
  fire('chat.conversation.upserted', envelope(22, { ...target, revision: 2, lastMessage: message }))
  assert.equal(store.get(cache.visibleChatConversationsAtom).length, 0)
  fire('chat.conversation.upserted', envelope(23, { ...target, revision: 4, lastMessage: message }))
  assert.deepEqual(
    store.get(cache.visibleChatConversationsAtom).map((item) => item.id),
    [target.id],
  )
} else if (scenario === 'deleted') {
  connect()
  success()
  const target = mockConversations[0]
  const message = mockMessage(1, target.id)
  store.set(cache.chatLiveCacheAtom, { contacts: [], conversations: [target], messages: [message] })
  store.set(ui.selectedChatIdAtom, target.id)
  const envelope = (id: number, data: unknown, outerSession = sessionId) => ({
    version: 1,
    eventId: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    occurredAt: '2026-10-31T12:00:00.000Z',
    sessionId: outerSession,
    data,
  })
  const deleted = { conversationId: target.id, deletedAt: '2026-10-31T12:00:00.000Z' }
  fire('chat.conversation.deleted', envelope(1, deleted, foreign))
  fire('chat.conversation.deleted', envelope(2, { ...deleted, deletedAt: 'invalid' }))
  assert.equal(store.get(ui.selectedChatIdAtom), target.id)
  fire('chat.conversation.deleted', envelope(3, deleted))
  assert.equal(store.get(ui.selectedChatIdAtom), null)
  assert.deepEqual(store.get(cache.chatLiveCacheAtom).conversations, [])
  assert.deepEqual(store.get(cache.chatLiveCacheAtom).messages, [])
  fire('chat.conversation.upserted', envelope(4, { conversation: target }))
  fire('chat.message.upserted', envelope(5, { message, source: 'live' }))
  assert.deepEqual(store.get(cache.chatLiveCacheAtom).conversations, [])
  assert.deepEqual(store.get(cache.chatLiveCacheAtom).messages, [])
  const replacement = { ...target, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
  fire('chat.conversation.upserted', envelope(6, { conversation: replacement }))
  assert.deepEqual(
    store.get(cache.chatLiveCacheAtom).conversations.map((item) => item.id),
    [replacement.id],
  )
} else if (scenario === 'forbidden') {
  client.setQueryData(cache.chatKeys.conversations(sessionId), { private: true })
  client.setQueryData(cache.chatKeys.conversations(foreign), { private: false })
  store.set(cache.chatLiveCacheAtom, {
    contacts: [],
    conversations: [mockConversations[0]],
    messages: [],
  })
  store.set(ui.chatDraftsAtom, {
    [`${sessionId}/draft`]: 'private',
    [`${foreign}/draft`]: 'other session',
  })
  store.set(ui.chatContactPanelAtom, {
    sessionId,
    conversationId: mockConversations[0].id,
    mediaMessageId: mockConversations[0].messages[0].id,
  })
  connect()
  assert.ok(ack)
  ack(null, { ok: false, error: { code: 'FORBIDDEN', message: 'denied' } })
  assert.equal(store.get(cache.chatAccessDeniedAtom), true)
  assert.equal(store.get(cache.chatSubscribedAtom), false)
  assert.equal(store.get(cache.chatConnectionStatusAtom), 'forbidden')
  assert.deepEqual(store.get(cache.chatLiveCacheAtom), {
    contacts: [],
    conversations: [],
    messages: [],
  })
  assert.deepEqual(store.get(ui.chatDraftsAtom), { [`${foreign}/draft`]: 'other session' })
  assert.equal(store.get(ui.chatContactPanelAtom), null)
  assert.equal(client.getQueryData(cache.chatKeys.conversations(sessionId)), undefined)
  assert.deepEqual(client.getQueryData(cache.chatKeys.conversations(foreign)), { private: false })
  const before = connects
  win.dispatchEvent(new Event('online'))
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(connects, before)
} else if (scenario === 'resync-global') {
  const { sessionKeys } = await import('../../src/atoms/session.ts')
  let requests = 0
  let finish: (() => void) | undefined
  let slow = false
  const observer = new QueryObserver(client, {
    queryKey: sessionKeys.list(),
    queryFn: async () => {
      requests++
      if (slow)
        await new Promise<void>((resolve) => {
          finish = resolve
        })
      return { data: [{ id: `snapshot-${requests}` }] }
    },
    staleTime: Infinity,
  })
  const unsubscribe = observer.subscribe(() => {})
  const until = async (condition: () => boolean, label: string) => {
    for (let i = 0; i < 200; i++) {
      if (condition()) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`timed out: ${label}, requests=${requests}`)
  }
  await until(() => requests === 1 && !client.isFetching(), 'initial global data')
  connect()
  success()
  await until(() => requests === 2 && !client.isFetching(), 'connected global reconciliation')
  fire('app.resync', { version: 99 })
  await tick()
  assert.equal(requests, 2)
  slow = true
  fire('app.resync', { version: 1 })
  await until(() => !!finish, 'slow global request')
  fire('app.resync', { version: 1 })
  fire('app.resync', { version: 1 })
  await tick()
  assert.equal(requests, 3, 'concurrent resync must not cancel the active fetch')
  slow = false
  const resolve = finish
  assert.ok(resolve)
  resolve()
  await until(() => requests === 4 && !client.isFetching(), 'single trailing global request')
  assert.deepEqual(client.getQueryData(sessionKeys.list()), { data: [{ id: 'snapshot-4' }] })
  await tick()
  assert.equal(requests, 4)
  unsubscribe()
} else if (scenario === 'unauthorized-handshake') {
  const target = mockConversations[0]
  store.set(ui.chatDraftsAtom, { [`${sessionId}/${target.id}`]: 'secret' })
  store.set(cache.chatLiveCacheAtom, { contacts: [], conversations: [target], messages: [] })
  store.set(cache.chatOptimisticMessagesAtom, [
    { ...mockMessage(1, target.id), localStatus: 'sending' },
  ])
  client.setQueryData(cache.chatKeys.conversations(sessionId), { private: true })
  fire('connect_error', Object.assign(new Error('denied'), { data: { code: 'UNAUTHORIZED' } }))
  assert.equal(store.get(cache.chatAccessDeniedAtom), true)
  assert.equal(store.get(cache.chatConnectionStatusAtom), 'unauthorized')
  assert.deepEqual(store.get(ui.chatDraftsAtom), {})
  assert.deepEqual(store.get(cache.chatLiveCacheAtom), {
    contacts: [],
    conversations: [],
    messages: [],
  })
  assert.deepEqual(store.get(cache.chatOptimisticMessagesAtom), [])
  assert.equal(client.getQueryData(cache.chatKeys.conversations(sessionId)), undefined)
  const before = connects
  win.dispatchEvent(new Event('online'))
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(connects, before)
} else if (scenario === 'resync-logs') {
  const logs = await import('../../src/atoms/realtime-logs.ts')
  const { webhookKeys } = await import('../../src/atoms/webhook.ts')
  const { api } = await import('../../src/lib/api-client.ts')
  const webhookId = 'webhook-fixture'
  const calls: unknown[] = []
  const log = (id: string, createdAt: string) => ({
    id,
    webhookId,
    sessionId,
    url: null,
    event: null,
    response: null,
    payload: {},
    webhookDisplayName: null,
    waSessionEventId: null,
    createdAt,
  })
  const old = log('old', '2026-01-01T00:00:00.000Z')
  const newest = log('new', '2026-01-02T00:00:00.000Z')
  let snapshot = [old]
  let holdLog: (() => void) | undefined
  let slowLog = false
  api.defaults.adapter = async (config) => {
    calls.push(config.params)
    if (slowLog)
      await new Promise<void>((resolve) => {
        holdLog = resolve
      })
    return { config, status: 200, statusText: 'OK', headers: {}, data: { data: snapshot } }
  }
  connect()
  success()
  store.set(logs.sessionIdAtom, sessionId)
  store.set(logs.webhookIdAtom, webhookId)
  const stopLogs = store.sub(logs.realtimeLogsEffectAtom, () => {})
  assert.ok(logsAck)
  logsAck(null, { ok: true, data: { sessionId, webhookId, subscribed: true } })
  const until = async (condition: () => boolean, label: string) => {
    for (let i = 0; i < 200; i++) {
      if (condition()) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`timed out: ${label}`)
  }
  await until(() => store.get(logs.webhookLogsAtom).length === 1, 'initial log snapshot')
  assert.deepEqual(calls, [{ page: 1, pageSize: 100 }])
  const base = webhookKeys.logs(sessionId, webhookId)
  const pageOne = [...base, { page: 1 }]
  const pageTwo = [...base, { page: 2 }]
  client.setQueryData(pageOne, { data: [old] })
  client.setQueryData(pageTwo, { data: [old], page: 2 })
  let firstRequests = 0
  let secondRequests = 0
  const first = new QueryObserver(client, {
    queryKey: pageOne,
    queryFn: async () => {
      firstRequests++
      return { data: [newest] }
    },
    staleTime: Infinity,
  })
  const second = new QueryObserver(client, {
    queryKey: pageTwo,
    queryFn: async () => {
      secondRequests++
      return { data: [old], page: 2 }
    },
    staleTime: Infinity,
  })
  const stopFirst = first.subscribe(() => {})
  const stopSecond = second.subscribe(() => {})
  snapshot = [newest, old]
  fire('app.resync', { version: 2 })
  await tick()
  assert.equal(calls.length, 1)
  assert.equal(firstRequests, 0)
  fire('app.resync', { version: 1 })
  await until(() => calls.length === 2 && firstRequests === 1, 'log resync snapshot and first page')
  assert.deepEqual(calls[1], { page: 1, pageSize: 100 })
  assert.deepEqual(
    store.get(logs.webhookLogsAtom).map((item) => item.id),
    ['new', 'old'],
  )
  assert.equal(store.get(logs.selectedLogAtom)?.id, 'new')
  assert.equal(secondRequests, 0)
  assert.deepEqual(client.getQueryData(pageTwo), { data: [old], page: 2 })
  slowLog = true
  fire('app.resync', { version: 1 })
  await until(() => !!holdLog, 'slow log snapshot')
  fire('app.resync', { version: 1 })
  fire('app.resync', { version: 1 })
  await tick()
  assert.equal(calls.length, 3, 'in-flight log snapshot must not be restarted')
  slowLog = false
  const resolve = holdLog
  assert.ok(resolve)
  resolve()
  await until(() => calls.length === 4, 'single trailing log snapshot')
  await until(
    () => store.get(logs.realtimeLogsStatusAtom) === 'open',
    'trailing log snapshot completed',
  )
  assert.equal(store.get(logs.selectedLogAtom)?.id, 'new')
  holdLog = undefined
  slowLog = true
  fire('app.resync', { version: 1 })
  await until(() => !!holdLog, 'snapshot before disposal')
  stopFirst()
  stopSecond()
  stopLogs()
  const resolveAfterDispose = holdLog
  assert.ok(resolveAfterDispose)
  resolveAfterDispose()
  await tick()
  assert.deepEqual(store.get(logs.webhookLogsAtom), [])
  assert.equal(store.get(logs.selectedLogAtom), null)
  assert.equal(handlers.get('logs.entry'), undefined)
  assert.equal(handlers.get('logs.revoked'), undefined)
} else if (scenario === 'resync-pages') {
  const target = mockConversations[0]
  const other = { ...target, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }
  const msg = mockMessage(1, other.id)
  const pendingMessage = { ...mockMessage(2, other.id), localStatus: 'sending' as const }
  const draftKey = `${sessionId}/${other.id}`
  let conversationCalls: (string | undefined)[] = []
  let messageCalls: (string | undefined)[] = []
  let hold: (() => void) | undefined
  let slow = false
  recoverySnapshot = async (cursor) => {
    conversationCalls.push(cursor)
    if (slow && !cursor)
      await new Promise<void>((resolve) => {
        hold = resolve
      })
    return {
      status: 'success',
      data: cursor ? [target] : [other],
      page: { nextCursor: cursor ? null : 'second', hasMore: !cursor },
    }
  }
  recoveryMessages = async (before) => {
    messageCalls.push(before)
    return {
      status: 'success',
      data: [msg],
      page: { nextCursor: before ? null : 'older', hasMore: !before },
    }
  }
  store.set(ui.selectedChatIdAtom, other.id)
  store.set(ui.chatDraftsAtom, { [draftKey]: 'keep me' })
  store.set(cache.chatOptimisticMessagesAtom, [pendingMessage])
  const stopConversations = store.sub(cache.chatConversationPagesAtom, () => {})
  const stopMessages = store.sub(cache.chatMessagePagesAtom, () => {})
  const until = async (condition: () => boolean, label: string) => {
    for (let i = 0; i < 200; i++) {
      if (condition()) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`timed out: ${label}: ${JSON.stringify({ conversationCalls, messageCalls })}`)
  }
  connect()
  success()
  autoSubscribe = true
  await until(
    () =>
      !!store.get(cache.chatConversationPagesAtom).data &&
      !!store.get(cache.chatMessagePagesAtom).data,
    'first pages',
  )
  await store.get(cache.chatConversationPagesAtom).fetchNextPage()
  await store.get(cache.chatMessagePagesAtom).fetchNextPage()
  await until(
    () =>
      store.get(cache.chatConversationPagesAtom).data?.pages.length === 2 &&
      store.get(cache.chatMessagePagesAtom).data?.pages.length === 2,
    'loaded second pages',
  )
  assert.equal(store.get(cache.chatConversationPagesAtom).data?.pages.length, 2)
  assert.equal(store.get(cache.chatMessagePagesAtom).data?.pages.length, 2)
  store.set(cache.forgetChatConversationAtom, { sessionId, conversationId: target.id })
  await tick()
  conversationCalls = []
  messageCalls = []
  fire('app.resync', { version: 2 })
  fire('app.resync', {})
  await new Promise((resolve) => setTimeout(resolve, 1100))
  assert.deepEqual(conversationCalls, [])
  assert.deepEqual(messageCalls, [])
  slow = true
  fire('app.resync', { version: 1 })
  await until(() => !!hold, 'slow reconciliation')
  fire('app.resync', { version: 1 })
  fire('app.resync', { version: 1 })
  await new Promise((resolve) => setTimeout(resolve, 1200))
  assert.deepEqual(
    conversationCalls,
    [undefined],
    'in-flight request must not be cancelled or restarted',
  )
  slow = false
  const finish = hold
  assert.ok(finish)
  finish()
  await until(
    () =>
      conversationCalls.filter((cursor) => cursor === undefined).length === 2 &&
      conversationCalls.filter((cursor) => cursor === 'second').length === 2 &&
      messageCalls.filter((cursor) => cursor === 'older').length >= 2,
    'trailing refresh of all pages',
  )
  assert.deepEqual(store.get(ui.chatDraftsAtom), { [draftKey]: 'keep me' })
  assert.deepEqual(store.get(cache.chatOptimisticMessagesAtom), [pendingMessage])
  assert.ok(
    !store.get(cache.apiChatConversationsAtom).some((item) => item.id === target.id),
    'deleted conversation must not revive from a snapshot',
  )
  stopConversations()
  stopMessages()
} else if (scenario === 'rate-limit-retry') {
  const realSetTimeout = globalThis.setTimeout
  const realClearTimeout = globalThis.clearTimeout
  const timers = new Map<number, () => void>()
  const delays: number[] = []
  let nextTimer = 0
  globalThis.setTimeout = ((run: () => void, delay: number) => {
    if (![10000, 20000, 30000].includes(delay)) return realSetTimeout(run, delay)
    delays.push(delay)
    const id = ++nextTimer
    timers.set(id, run)
    return id
  }) as typeof setTimeout
  globalThis.clearTimeout = ((id: ReturnType<typeof setTimeout>) => {
    if (typeof id === 'number' && timers.has(id)) timers.delete(id)
    else realClearTimeout(id)
  }) as typeof clearTimeout
  try {
    const target = mockConversations[0]
    const message = { ...mockMessage(1, target.id), localStatus: 'sending' as const }
    const draftKey = `${sessionId}/${target.id}`
    store.set(ui.chatDraftsAtom, { [draftKey]: 'rascunho' })
    store.set(cache.chatLiveCacheAtom, { contacts: [], conversations: [target], messages: [] })
    store.set(cache.chatOptimisticMessagesAtom, [message])
    client.setQueryData(cache.chatKeys.conversations(sessionId), { private: true })
    const rateLimited = Object.assign(new Error('temporary'), { data: { code: 'RATE_LIMITED' } })
    fire('connect_error', rateLimited)
    fire('connect_error', rateLimited)
    assert.equal(store.get(cache.chatAccessDeniedAtom), false)
    assert.deepEqual(store.get(ui.chatDraftsAtom), { [draftKey]: 'rascunho' })
    assert.deepEqual(store.get(cache.chatOptimisticMessagesAtom), [message])
    assert.deepEqual(store.get(cache.chatLiveCacheAtom).conversations, [target])
    assert.deepEqual(client.getQueryData(cache.chatKeys.conversations(sessionId)), {
      private: true,
    })
    assert.equal(timers.size, 1, 'repeated limits must share one retry timer')
    const before = connects
    win.dispatchEvent(new Event('online'))
    doc.dispatchEvent(new Event('visibilitychange'))
    assert.equal(connects, before, 'online and visibility must not bypass backoff')
    const [id, retry] = [...timers][0]
    timers.delete(id)
    retry()
    assert.equal(connects, before + 1)
    fire('connect_error', rateLimited)
    assert.equal(timers.size, 1)
    assert.deepEqual(delays, [10000, 20000])
    stop()
    stopApp()
    assert.equal(timers.size, 0, 'disposing cancels pending retry')
    const after = connects
    win.dispatchEvent(new Event('online'))
    doc.dispatchEvent(new Event('visibilitychange'))
    assert.equal(connects, after)
    assert.equal(handlers.size, 0)
    assert.equal(managerHandlers.size, 0)
  } finally {
    globalThis.setTimeout = realSetTimeout
    globalThis.clearTimeout = realClearTimeout
  }
} else if (scenario === 'cleanup') {
  connect()
  success()
  store.set(ui.chatContactPanelAtom, {
    sessionId,
    conversationId: mockConversations[0].id,
    mediaMessageId: null,
  })
  stop()
  assert.deepEqual(emitted.at(-1), { event: 'chat.session.unsubscribe', payload: { sessionId } })
  assert.equal(removed, 0)
  assert.equal(disconnects, 0)
  assert.equal(handlers.get('chat.message.upserted'), undefined)
  assert.equal(store.get(cache.chatSubscribedAtom), false)
  assert.equal(store.get(ui.chatContactPanelAtom), null)
  const before = connects
  win.dispatchEvent(new Event('online'))
  doc.dispatchEvent(new Event('visibilitychange'))
  assert.equal(connects, before)
}
stop()
stopApp()
client.clear()
