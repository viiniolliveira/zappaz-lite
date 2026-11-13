import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

let created = 0
let dispatched = 0
mock.module('../../server/src/modules/mcp/service.ts', () => ({
  createMcpServer() {
    created++
    const server = new McpServer({ name: 'fixture', version: '1' })
    server.registerTool('ping', { inputSchema: z.object({}) }, async () => {
      dispatched++
      return { content: [{ type: 'text', text: 'pong' }] }
    })
    return server
  },
}))
mock.module('@lib/logger', () => ({ logger: { warn() {}, error() {}, info() {} } }))
const { createRouter } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { mcpController } = await import('../../server/src/modules/mcp/controller.ts')
const app = createRouter()
app.onError(errorHandler)
app.use('*', async (c, next) => {
  c.set('user', { id: 'fixture', role: 'USER' })
  await next()
})
app.all('/mcp', mcpController)
const call = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: { name: 'ping', arguments: {} },
}
const headers = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'x-zappaz-preset': 'user',
}
for (const batch of [[], [call], Array.from({ length: 101 }, () => call)]) {
  const response = await app.request('/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify(batch),
  })
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'BAD_REQUEST')
  assert.equal(created, 0)
  assert.equal(dispatched, 0)
}
const malformed = await app.request('/mcp', { method: 'POST', headers, body: '{' })
assert.equal(malformed.status, 400)
assert.equal(created, 0)
const single = await app.request('/mcp', { method: 'POST', headers, body: JSON.stringify(call) })
assert.equal(single.status, 200)
const text = await single.text()
const data = text.startsWith('event:')
  ? text
      .split('\n')
      .find((line) => line.startsWith('data: '))
      ?.slice(6)
  : text
assert.ok(data)
assert.equal(JSON.parse(data).result.content[0].text, 'pong')
assert.equal(created, 1)
assert.equal(dispatched, 1)
