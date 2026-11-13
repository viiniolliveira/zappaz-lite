import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { serveStatic } from '@hono/node-server/serve-static'

import { createRouter } from '../../create-app.ts'

const distRoot = fileURLToPath(new URL('../../../../dist/', import.meta.url))

export function createFrontendRouter(root = distRoot) {
  const router = createRouter()
  const staticFiles = serveStatic({ root })
  const indexFile = serveStatic({ root, path: 'index.html' })

  router.get('*', async (c, next) => {
    let path: string
    try {
      path = decodeURIComponent(c.req.path)
    } catch {
      return next()
    }

    if (
      /^\/(api|admin|health|mcp)(\/|$)/.test(path) ||
      path.split('/').some((segment) => segment.startsWith('.'))
    ) {
      return next()
    }

    if (
      path === '/' ||
      path.endsWith('/index.html') ||
      path === '/sw.js' ||
      path === '/manifest.webmanifest'
    ) {
      c.header('Cache-Control', 'no-cache')
    }

    const response = await staticFiles(c, async () => undefined)
    if (response) return response

    if (
      path === '/assets' ||
      path.startsWith('/assets/') ||
      extname(path) ||
      !c.req.header('Accept')?.includes('text/html')
    ) {
      return next()
    }

    c.header('Cache-Control', 'no-cache')
    return indexFile(c, next)
  })

  return router
}
