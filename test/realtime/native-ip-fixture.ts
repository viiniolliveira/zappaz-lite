import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import WebSocket from '../../node_modules/ws/lib/websocket.js'

let authCalls = 0
mock.module('../../server/src/middleware/auth.ts', () => ({
  requestUser: async () => {
    authCalls++
    return null
  },
  authenticateRealtime: async () => false,
  authorizeSession: async () => false,
  authorizeSessionById: async () => false,
}))
mock.module('../../server/src/db/prisma.ts', () => ({ prisma: {} }))
mock.module('../../server/src/services/whatsapp.ts', () => ({ whatsappService: {} }))
mock.module('../../server/src/realtime/publisher.ts', () => ({
  registerChatPublisher: () => () => {},
}))
mock.module('../../server/src/realtime/app-publisher.ts', () => ({
  registerAppPublisher: () => () => {},
}))
mock.module('../../server/src/lib/logger.ts', () => ({
  logger: { error() {}, info() {}, warn() {} },
}))
const { createRealtimeServer } = await import('../../server/src/realtime/server.ts')
const realtime = createRealtimeServer()
const nativeAddresses: (string | undefined)[] = []
const server = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  fetch: (req, srv) => {
    nativeAddresses.push(srv.requestIP(req)?.address)
    return realtime.engine.handleRequest(req, srv)
  },
  websocket: realtime.websocket,
})
async function rejected(source: string) {
  return new Promise<string>((resolve, reject) => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${server.port}/api/ws/?EIO=4&transport=websocket`,
      { localAddress: source },
    )
    socket.on('error', reject)
    socket.on('message', (raw) => {
      const text = raw.toString()
      if (text.startsWith('0')) socket.send('40')
      else if (text.startsWith('44')) {
        socket.close()
        resolve(JSON.parse(text.slice(2)).data.code)
      }
    })
  })
}
try {
  for (let i = 0; i < 30; i++) assert.equal(await rejected('127.0.0.1'), 'UNAUTHORIZED')
  assert.equal(await rejected('127.0.0.1'), 'RATE_LIMITED')
  assert.equal(await rejected('127.0.0.2'), 'UNAUTHORIZED')
  assert.deepEqual(nativeAddresses, [...Array(31).fill('127.0.0.1'), '127.0.0.2'])
  assert.equal(authCalls, 31, 'the first address gets 30 attempts and the second gets one')
} finally {
  realtime.stopPublisher()
  realtime.io.close()
  server.stop(true)
}
