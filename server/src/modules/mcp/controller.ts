import { createMcpHandler } from '@modelcontextprotocol/server'
import { BadRequestError } from '@server/common/errors/bad-request-error.ts'
import { UnauthorizedError } from '@server/common/errors/unauthorized-error.ts'
import type { AppEnv } from '@server/create-app.ts'
import type { Context } from 'hono'
import { McpPresetSchema } from './schema.ts'
import { createMcpServer } from './service.ts'

export async function mcpController(c: Context<AppEnv>) {
  const parsedBody: unknown = c.req.method === 'POST' ? await c.req.json() : undefined
  if (Array.isArray(parsedBody)) throw new BadRequestError('MCP batches are not supported')
  const preset = McpPresetSchema.parse(c.req.header('x-zappaz-preset'))
  const session = c.get('session')
  const user = c.get('user')
  if (preset === 'session') {
    if (!session) throw new UnauthorizedError('Access denied')
    return createMcpHandler(() => createMcpServer({ preset, sessionId: session.id })).fetch(
      c.req.raw,
      { parsedBody },
    )
  }
  if (!user) throw new UnauthorizedError('Access denied')
  const handler = createMcpHandler(() => createMcpServer({ preset, user }))
  return handler.fetch(c.req.raw, { parsedBody })
}
