import type { ChatSocket } from './types.ts'

const pending = new WeakMap<ChatSocket, ReturnType<typeof setTimeout>>()

export function requestRealtimeResync(socket: ChatSocket) {
  if (!socket.connected || pending.has(socket)) return
  const clear = () => {
    const timer = pending.get(socket)
    if (timer) clearTimeout(timer)
    pending.delete(socket)
    socket.off('disconnect', clear)
  }
  // Retain only one control timer, never dropped event payloads or a replay queue.
  const timer = setTimeout(() => {
    clear()
    if (socket.connected) socket.emit('app.resync', { version: 1 })
  }, 1000)
  timer.unref()
  pending.set(socket, timer)
  socket.once('disconnect', clear)
}
