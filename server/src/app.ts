import { errorHandler } from '@server/common/http/error-handler'
import { notFoundHandler } from '@server/common/http/not-found-handler'
import { config } from '@server/config'
import createApp from '@server/create-app'
import { logger } from '@server/lib/logger'
import { runScheduledTasks } from '@server/lib/utils'
import { corsMiddleware } from '@server/middleware/cors'
import authRouter from '@server/modules/auth/route'
import { createFrontendRouter } from '@server/modules/frontend/route.ts'
import globalWebhooksRouter from '@server/modules/global-webhooks/route.ts'
import mcpRouter from '@server/modules/mcp/route.ts'
import sendMessageHistoryRouter, {
  apiSendMessageHistoryRouter,
} from '@server/modules/send-message-history/route'
import { adminSessionsRouter, apiSessionsRouter } from '@server/modules/sessions/route'
import webhooksRouter from '@server/modules/webhooks/route'
import whatsappActionsRouter from '@server/modules/whatsapp-actions/route'
import whatsappGroupsRouter from '@server/modules/whatsapp-groups/route'
import whatsappMessagesRouter from '@server/modules/whatsapp-messages/route'
import whatsappPrivacyRouter from '@server/modules/whatsapp-privacy/route'
import { whatsappService } from '@services/whatsapp'
import { serve } from 'bun'
import { initializeAdmin } from './db/initialize-admin.ts'
import { clientIp } from './lib/client-ip.ts'
import { startConversationMediaCleanup } from './lib/conversation-media-cleanup.ts'
import { accessLog } from './middleware/access-log.ts'
import chatLibraryRouter from './modules/chat-library/route.ts'
import contactsRouter from './modules/contacts/route.ts'
import conversationLabelsRouter from './modules/conversation-labels/route.ts'
import conversationMessagesRouter from './modules/conversation-messages/route.ts'
import conversationsRouter from './modules/conversations/route.ts'
import { describeApiRoute } from './modules/docs/openapi.ts'
import { createDocsRouter } from './modules/docs/route.ts'
import mediaRouter from './modules/media/route.ts'
import quickMessagesRouter from './modules/quick-messages/route.ts'
import { createRealtimeServer } from './realtime/server.ts'

const app = createApp()

app.onError(errorHandler)
app.use('*', accessLog)
app.use('*', corsMiddleware)
app.use('*', async (c, next) => {
  c.set('user', null)
  c.set('token', null)
  c.set('session', null)
  await next()
})

app.get('/health', describeApiRoute('GET', '/health'), (c) => c.json({ ok: true }))

app.route('/', authRouter)
app.route('/admin', globalWebhooksRouter)
app.route('/admin', sendMessageHistoryRouter)
app.route('/admin', adminSessionsRouter)
app.route('/api/v1', apiSessionsRouter)
app.route('/api/v1', apiSendMessageHistoryRouter)
app.route('/', webhooksRouter)
app.route('/', whatsappMessagesRouter)
app.route('/', whatsappActionsRouter)
app.route('/', whatsappGroupsRouter)
app.route('/', whatsappPrivacyRouter)
app.route('/', mcpRouter)
app.route('/', contactsRouter)
app.route('/', conversationLabelsRouter)
app.route('/', quickMessagesRouter)
app.route('/', conversationsRouter)
app.route('/', conversationMessagesRouter)
app.route('/', chatLibraryRouter)
app.route('/', mediaRouter)
app.route('/', createDocsRouter(app))
app.route('/', createFrontendRouter())

app.notFound(notFoundHandler)

async function startServer() {
  try {
    const adminSetup = await initializeAdmin()
    if (adminSetup === 'created') logger.info('Initial administrator created')
    if (adminSetup === 'reset')
      logger.warn(
        'Administrator password reset. Remove ADMIN_RESET_PASSWORD before the next restart.',
      )
    startConversationMediaCleanup()
    await whatsappService.loadStoredSessions()

    const realtime = createRealtimeServer()
    serve({
      port: config.port,
      idleTimeout: 90,
      maxRequestBodySize: config.mediaRequestBodyBytes,
      fetch(request, server) {
        const path = new URL(request.url).pathname
        if (path === '/api/ws' || path.startsWith('/api/ws/'))
          return realtime.engine.handleRequest(request, server)
        return app.fetch(request, {
          clientIp: clientIp(request, server.requestIP(request)?.address),
        })
      },
      websocket: realtime.websocket,
    })
    logger.info('🔄 Running scheduled tasks')
    runScheduledTasks()
    logger.info(`🚀 Server listening on port ${config.port}`)
  } catch (error) {
    logger.error({
      msg: 'Failed to start server',
      stack: (error as Error)?.stack,
      extra: { source: 'Main', function: 'startServer' },
    })
    process.exit(1)
  }
}

startServer()
