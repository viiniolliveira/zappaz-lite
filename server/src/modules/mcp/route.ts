import { requireMcpAccess } from '@middleware/auth.ts'
import { rateLimiter } from '@middleware/rate-limiter.ts'
import { hostHeaderValidation, originValidation } from '@modelcontextprotocol/hono'
import { createRouter } from '@server/create-app.ts'
import { mcpController } from './controller.ts'
import { mcpHttpOptions } from './schema.ts'

const mcpRouter = createRouter()
mcpRouter.all(
  '/mcp',
  hostHeaderValidation(mcpHttpOptions.allowedHosts),
  originValidation(mcpHttpOptions.allowedOrigins),
  rateLimiter,
  requireMcpAccess,
  mcpController,
)
export default mcpRouter
