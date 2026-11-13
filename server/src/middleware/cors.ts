import { cors } from 'hono/cors'
import { config } from '../config.ts'
import { allowedAppOrigins } from '../lib/app-url.ts'

const origins = allowedAppOrigins(config.appUrl, config.isProduction)

export const corsMiddleware = cors({
  origin: origins,
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Api-Key',
    'HX-Request',
    'MCP-Protocol-Version',
    'Mcp-Session-Id',
    'Last-Event-ID',
    'Range',
    'X-Realtime-Socket-Id',
  ],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: [
    'Content-Length',
    'HX-Redirect',
    'Mcp-Session-Id',
    'MCP-Protocol-Version',
    'Content-Range',
    'Content-Disposition',
    'Accept-Ranges',
    'Retry-After',
  ],
  maxAge: 600,
  credentials: true,
})
