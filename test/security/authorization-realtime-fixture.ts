import assert from 'node:assert/strict'
import { io, type Socket } from 'socket.io-client'
import { prisma } from '../../server/src/db/prisma.ts'
import { publishChatChange } from '../../server/src/lib/chat-events.ts'
import { pubSub } from '../../server/src/lib/pub-sub.ts'
import {
  toWebhookLogCreatedEvent,
  webhookLogCreatedChannel,
} from '../../server/src/lib/webhook-log-events.ts'
import { createRealtimeServer } from '../../server/src/realtime/server.ts'
import type { ClientEvents, ServerEvents } from '../../server/src/realtime/types.ts'

type Client = Socket<ServerEvents, ClientEvents>
type Key = { id: string; key: string }
type RecordFixture = {
  id: string
  conversation: { id: string }
  webhook: { id: string }
  log: Parameters<typeof toWebhookLogCreatedEvent>[0]
}

type Input = {
  ownerId: string
  otherId: string
  adminId: string
  adminCookie: string
  scoped: Key
  adminScoped: Key
  global: Key
  a: RecordFixture
  a2: RecordFixture
  b: RecordFixture
}

function waitConnect(socket: Client, expected: 'connect' | 'connect_error') {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`Socket ${expected} timed out`))
    }, 5000)
    const cleanup = () => {
      clearTimeout(timer)
      socket.off('connect', connected)
      socket.off('connect_error', failed)
    }
    const connected = () => {
      cleanup()
      expected === 'connect' ? resolve() : reject(new Error('Unexpected socket connection'))
    }
    const failed = (error: Error) => {
      cleanup()
      expected === 'connect_error' ? resolve() : reject(error)
    }
    socket.once('connect', connected)
    socket.once('connect_error', failed)
    socket.connect()
  })
}
function waitRevoked(socket: Client, kind: 'chat.session.revoked' | 'logs.revoked') {
  return new Promise<{ sessionId: string }>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(kind, onRevoked)
      reject(new Error(`${kind} timed out`))
    }, 5000)
    const onRevoked = (event: { sessionId: string }) => {
      clearTimeout(timer)
      resolve(event)
    }
    socket.once(kind, onRevoked)
  })
}
function waitTyping(socket: Client) {
  return new Promise<{ sessionId: string; data: { conversationId: string } }>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('chat.typing', onTyping)
      reject(new Error('chat.typing timed out'))
    }, 5000)
    const onTyping = (event: { sessionId: string; data: { conversationId: string } }) => {
      clearTimeout(timer)
      resolve(event)
    }
    socket.once('chat.typing', onTyping)
  })
}
function waitLog(socket: Client) {
  return new Promise<Parameters<ServerEvents['logs.entry']>[0]>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off('logs.entry', onLog)
      reject(new Error('logs.entry timed out'))
    }, 5000)
    const onLog = (event: Parameters<ServerEvents['logs.entry']>[0]) => {
      clearTimeout(timer)
      resolve(event)
    }
    socket.once('logs.entry', onLog)
  })
}
async function subscribe(socket: Client, sessionId: string, expected: boolean) {
  const ack = await socket.timeout(5000).emitWithAck('chat.session.subscribe', { sessionId })
  assert.equal(ack.ok, expected, `chat subscribe ${sessionId}: ${JSON.stringify(ack)}`)
}
async function subscribeLogs(
  socket: Client,
  sessionId: string,
  webhookId: string,
  expected: boolean,
) {
  const ack = await socket.timeout(5000).emitWithAck('logs.subscribe', { sessionId, webhookId })
  assert.equal(ack.ok, expected, `logs subscribe ${sessionId}/${webhookId}: ${JSON.stringify(ack)}`)
}

export async function verifyRealtime(input: Input) {
  const { ownerId, otherId, adminId, adminCookie, scoped, adminScoped, global, a, a2, b } = input
  const realtime = createRealtimeServer()
  const server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch: (request, bunServer) => realtime.engine.handleRequest(request, bunServer),
    websocket: realtime.websocket,
  })
  const clients: Client[] = []
  const makeClient = (
    options: {
      auth?: { apiKey: string }
      extraHeaders?: Record<string, string>
      query?: Record<string, string>
    } = {},
  ) => {
    const socket: Client = io(`http://127.0.0.1:${server.port}`, {
      path: '/api/ws',
      transports: ['websocket'],
      autoConnect: false,
      reconnection: false,
      ...options,
    })
    clients.push(socket)
    return socket
  }
  const spareAdminId = crypto.randomUUID()
  try {
    for (const options of [
      {},
      { query: { apiKey: scoped.key } },
      { auth: { apiKey: scoped.key }, extraHeaders: { origin: 'https://evil.example' } },
    ]) {
      await waitConnect(makeClient(options), 'connect_error')
    }
    const scopedSocket = makeClient({ auth: { apiKey: scoped.key } })
    const adminScopedSocket = makeClient({ extraHeaders: { 'x-api-key': adminScoped.key } })
    const globalSocket = makeClient({ extraHeaders: { 'x-api-key': global.key } })
    const adminSocket = makeClient({
      extraHeaders: { cookie: adminCookie, origin: 'http://localhost:3001' },
    })
    for (const socket of [scopedSocket, adminScopedSocket, globalSocket, adminSocket]) {
      await waitConnect(socket, 'connect')
      assert.equal(socket.io.engine.transport.name, 'websocket')
    }
    for (const socket of [scopedSocket, adminScopedSocket]) {
      await subscribe(socket, a.id, true)
      await subscribe(socket, a2.id, false)
      await subscribe(socket, b.id, false)
    }
    await subscribe(globalSocket, a.id, true)
    await subscribe(globalSocket, a2.id, true)
    await subscribe(globalSocket, b.id, false)
    await subscribe(adminSocket, b.id, true)
    await subscribeLogs(scopedSocket, a.id, b.webhook.id, false)
    await subscribeLogs(scopedSocket, b.id, b.webhook.id, false)
    await subscribeLogs(scopedSocket, a.id, a.webhook.id, true)
    const received: string[] = []
    for (const [name, socket] of [
      ['scoped', scopedSocket],
      ['adminScoped', adminScopedSocket],
      ['global', globalSocket],
      ['admin', adminSocket],
    ] as const)
      socket.on('chat.typing', () => received.push(name))
    const typing = [
      waitTyping(scopedSocket),
      waitTyping(adminScopedSocket),
      waitTyping(globalSocket),
    ]
    publishChatChange({ sessionId: a.id, typing: { conversationId: a.conversation.id } })
    for (const event of await Promise.all(typing)) {
      assert.equal(event.sessionId, a.id)
      assert.equal(event.data.conversationId, a.conversation.id)
    }
    await new Promise((resolve) => setTimeout(resolve, 150))
    assert.deepEqual(received.sort(), ['adminScoped', 'global', 'scoped'])
    let logCount = 0
    scopedSocket.on('logs.entry', () => logCount++)
    const logEvent = waitLog(scopedSocket)
    pubSub.publish(webhookLogCreatedChannel(a.id, a.webhook.id), toWebhookLogCreatedEvent(a.log))
    assert.equal((await logEvent).data.id, a.log.id)

    // Revocation is checked again on delivery, without waiting for the periodic timer.
    const revokedChat = waitRevoked(scopedSocket, 'chat.session.revoked')
    const revokedLogs = waitRevoked(scopedSocket, 'logs.revoked')
    const stillAuthorized = waitTyping(globalSocket)
    await prisma.apikey.update({ where: { id: scoped.id }, data: { enabled: false } })
    publishChatChange({ sessionId: a.id, typing: { conversationId: a.conversation.id } })
    pubSub.publish(webhookLogCreatedChannel(a.id, a.webhook.id), toWebhookLogCreatedEvent(a.log))
    assert.equal((await revokedChat).sessionId, a.id)
    assert.equal((await revokedLogs).sessionId, a.id)
    assert.equal((await stillAuthorized).sessionId, a.id)
    assert.equal(received.filter((name) => name === 'scoped').length, 1)
    assert.equal(logCount, 1)
    await subscribe(scopedSocket, a.id, false)
    await subscribeLogs(scopedSocket, a.id, a.webhook.id, false)
    await prisma.apikey.update({ where: { id: scoped.id }, data: { enabled: true } })

    const transferred = waitRevoked(globalSocket, 'chat.session.revoked')
    const globalCount = received.filter((name) => name === 'global').length
    await prisma.waSession.update({ where: { id: a2.id }, data: { userId: otherId } })
    publishChatChange({ sessionId: a2.id, typing: { conversationId: a2.conversation.id } })
    assert.equal((await transferred).sessionId, a2.id)
    assert.equal(received.filter((name) => name === 'global').length, globalCount)
    await subscribe(globalSocket, a2.id, false)
    await prisma.waSession.update({ where: { id: a2.id }, data: { userId: ownerId } })

    await prisma.user.update({ where: { id: ownerId }, data: { banned: true } })
    await subscribe(globalSocket, a.id, false)
    await prisma.user.update({ where: { id: ownerId }, data: { banned: false } })

    await prisma.user.create({
      data: {
        id: spareAdminId,
        email: 'spare-admin@example.test',
        role: 'ADMIN',
        firstName: 'Spare',
        lastName: 'Admin',
      },
    })
    await prisma.user.update({ where: { id: adminId }, data: { role: 'USER' } })
    await subscribe(adminSocket, b.id, false)
    await prisma.user.update({ where: { id: adminId }, data: { role: 'ADMIN' } })
  } finally {
    for (const socket of clients) socket.disconnect()
    realtime.stopPublisher()
    try {
      realtime.io.close()
    } finally {
      server.stop(true)
    }
  }
}
