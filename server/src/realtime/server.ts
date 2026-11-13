import { Server as Engine } from '@socket.io/bun-engine'
import { Server } from 'socket.io'
import { config } from '../config.ts'
import { allowedAppOrigins, parseAppUrl } from '../lib/app-url.ts'
import { clientIp } from '../lib/client-ip.ts'
import { registerAppPublisher } from './app-publisher.ts'
import { registerRealtimeHandlers } from './handlers.ts'
import { registerChatPublisher } from './publisher.ts'
import type { ChatServer } from './types.ts'

export function realtimeOrigins(value = config.appUrl) {
  const isProduction = config.isProduction
  return allowedAppOrigins(parseAppUrl(value, isProduction), isProduction)
}
export function createRealtimeServer() {
  const origins = realtimeOrigins()
  const requestAddresses = new WeakMap<Request, string>()
  const io: ChatServer = new Server({
    path: '/api/ws',
    cors: { origin: origins, credentials: true },
    maxHttpBufferSize: 16384,
    pingInterval: 15000,
    pingTimeout: 10000,
  })
  const engine = new Engine({
    path: '/api/ws/',
    maxHttpBufferSize: 16384,
    pingInterval: 15000,
    pingTimeout: 10000,
    cors: { origin: origins, credentials: true },
    allowRequest: async (request, server) => {
      const origin = request.headers.get('origin')
      if (origin && !origins.includes(origin)) throw new Error('Origin denied')
      if (
        [...new URL(request.url).searchParams.keys()].some((key) =>
          /token|authorization|api.?key/i.test(key),
        )
      )
        throw new Error('Query credentials are forbidden')
      // Bun no longer exposes requestIP after a successful WebSocket upgrade.
      const address = clientIp(request, server.requestIP(request)?.address)
      if (!address) throw new Error('Client address unavailable')
      requestAddresses.set(request, address)
    },
  })
  const addresses = new WeakMap<object, string>()
  engine.on('connection', (connection, request) => {
    const address = requestAddresses.get(request)
    requestAddresses.delete(request)
    if (address) addresses.set(connection, address)
  })
  io.bind(engine)
  registerRealtimeHandlers(io, (socket) => addresses.get(socket.conn))
  const stopChat = registerChatPublisher(io)
  const stopApp = registerAppPublisher(io)
  const stopPublisher = () => {
    stopChat()
    stopApp()
  }
  return { io, engine, websocket: engine.handler().websocket, stopPublisher }
}
