import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { hashPassword } from 'better-auth/crypto'
import { errorHandler } from '../../server/src/common/http/error-handler.ts'
import createApp from '../../server/src/create-app.ts'
import { prisma } from '../../server/src/db/prisma.ts'
import authRouter from '../../server/src/modules/auth/route.ts'
import contacts from '../../server/src/modules/contacts/route.ts'
import labels from '../../server/src/modules/conversation-labels/route.ts'
import messages from '../../server/src/modules/conversation-messages/route.ts'
import conversations from '../../server/src/modules/conversations/route.ts'
import mcp from '../../server/src/modules/mcp/route.ts'
import quickMessages from '../../server/src/modules/quick-messages/route.ts'
import { adminSessionsRouter, apiSessionsRouter } from '../../server/src/modules/sessions/route.ts'
import webhooks from '../../server/src/modules/webhooks/route.ts'
import legacyMessages from '../../server/src/modules/whatsapp-messages/route.ts'
import { verifyRealtime } from './authorization-realtime-fixture.ts'

const app = createApp()
app.onError(errorHandler)
for (const router of [
  authRouter,
  conversations,
  messages,
  contacts,
  labels,
  quickMessages,
  webhooks,
  legacyMessages,
  mcp,
])
  app.route('/', router)
app.route('/api/v1', apiSessionsRouter)
app.route('/admin', adminSessionsRouter)
const origin = 'http://localhost:3001'
const password = 'password-for-authorization-test'
type Options = {
  method?: string
  body?: unknown
  cookie?: string
  key?: string
  bearer?: string
  headers?: Record<string, string>
}
function request(path: string, options: Options = {}) {
  return app.request(
    `${origin}${path}`,
    {
      method: options.method ?? 'GET',
      headers: {
        ...(options.cookie ? { cookie: options.cookie, origin } : {}),
        ...(options.key !== undefined ? { 'x-api-key': options.key } : {}),
        ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
        ...options.headers,
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    },
    { clientIp: '127.0.0.1' },
  )
}
async function status(path: string, expected: number, options: Options = {}) {
  const res = await request(path, options)
  assert.equal(
    res.status,
    expected,
    `${options.method ?? 'GET'} ${path}: ${await res.clone().text()}`,
  )
  return res
}
async function user(email: string, role: 'USER' | 'ADMIN') {
  const id = crypto.randomUUID()
  return prisma.user.create({
    data: {
      id,
      email,
      role,
      firstName: role,
      lastName: 'Test',
      accounts: {
        create: { accountId: id, providerId: 'credential', password: await hashPassword(password) },
      },
    },
  })
}
async function login(email: string) {
  const res = await status('/api/auth/sign-in/email', 200, {
    method: 'POST',
    headers: { origin },
    body: { email, password },
  })
  const cookie = res.headers.getSetCookie().find((value) => /session_token=/.test(value))
  assert.ok(cookie)
  return cookie.split(';', 1).join('')
}
async function key(cookie: string, metadata: object) {
  const res = await status('/api/auth/api-key/create', 200, {
    method: 'POST',
    cookie,
    body: { name: 'test key', metadata },
  })
  return (await res.json()) as { id: string; key: string }
}
async function mcpCall(
  keyValue: string,
  preset: 'user' | 'session',
  sessionId: string | undefined,
  name: string,
  args: object,
) {
  const res = await status('/mcp', 200, {
    method: 'POST',
    key: keyValue,
    headers: {
      host: 'localhost',
      accept: 'application/json, text/event-stream',
      'x-zappaz-preset': preset,
      ...(sessionId ? { 'x-zappaz-session-id': sessionId } : {}),
    },
    body: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  })
  const text = await res.text()
  return JSON.parse(text.startsWith('event:') ? (text.match(/data: (.*)/)?.[1] ?? text) : text) as {
    result?: { isError?: boolean; content: { text: string }[] }
    error?: unknown
  }
}
try {
  const owner = await user('owner@example.test', 'USER')
  const other = await user('other@example.test', 'USER')
  const admin = await user('admin@example.test', 'ADMIN')
  const ownerCookie = await login(owner.email)
  const otherCookie = await login(other.email)
  const adminCookie = await login(admin.email)
  const records = []
  for (const [id, userId] of [
    ['session-a', owner.id],
    ['session-a2', owner.id],
    ['session-b', other.id],
  ] as const) {
    await prisma.waSession.create({ data: { id, userId, enabled: true } })
    const contact = await prisma.waContact.create({
      data: {
        sessionId: id,
        jid: `${id}@s.whatsapp.net`,
        localName: `contact-${id}`,
        isSaved: true,
      },
    })
    const conversation = await prisma.waConversation.create({
      data: { sessionId: id, jid: contact.jid, contactId: contact.id },
    })
    const message = await prisma.waMessage.create({
      data: {
        sessionId: id,
        conversationId: conversation.id,
        messageId: `wa-${id}`,
        text: `secret-${id}`,
        rawContent: {},
      },
    })
    const storageKey = `${id}/${conversation.id}/${message.id}`
    const mediaPath = process.env.MEDIA_STORAGE_PATH
    assert.ok(mediaPath)
    const path = join(mediaPath, storageKey)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `bytes-${id}`)
    const media = await prisma.waMessageMedia.create({
      data: {
        sessionId: id,
        conversationId: conversation.id,
        messageId: message.id,
        kind: 'document',
        mimeType: 'application/octet-stream',
        storage: 'local',
        key: storageKey,
        storageStatus: 'ready',
      },
    })
    await prisma.waConversationLabel.create({
      data: { sessionId: id, name: `label-${id}`, description: '', color: '#000000' },
    })
    await prisma.waQuickMessage.create({
      data: { sessionId: id, name: `quick-${id}`, command: '/test', message: `quick-secret-${id}` },
    })
    const webhook = await prisma.webhook.create({
      data: {
        waSessionId: id,
        url: 'https://example.test',
        enabled: false,
        events: {},
        headers: {},
        displayName: `webhook-${id}`,
      },
    })
    const log = await prisma.webhookLog.create({
      data: {
        webhookId: webhook.id,
        sessionId: id,
        response: {},
        payload: { secret: `log-${id}` },
      },
    })
    records.push({ id, contact, conversation, message, media, webhook, log })
  }
  const [a, a2, b] = records
  assert.ok(a && a2 && b)
  const global = await key(ownerCookie, { scope: 'global' })
  const scoped = await key(ownerCookie, { scope: 'session', sessionId: a.id })
  const adminScoped = await key(adminCookie, { scope: 'session', sessionId: a.id })
  const base = `/api/v1/session/${a.id}`
  const conv = `${base}/conversations/${a.conversation.id}`
  await status(conv, 200, { cookie: ownerCookie })
  await status(conv, 401, { cookie: otherCookie })
  await status(conv, 401)
  await status(conv, 401, { bearer: 'removed-jwt' })
  await status(conv, 401, { cookie: ownerCookie, key: 'invalid' })
  await status(`/api/v1/session/${b.id}`, 401, { key: global.key })
  await status(`/api/v1/session/${a2.id}`, 401, { key: scoped.key })
  await status(`/api/v1/session/${b.id}`, 401, { key: adminScoped.key })
  await status('/admin/session', 403, { key: adminScoped.key })
  for (const credential of [
    { cookie: ownerCookie },
    { cookie: adminCookie },
    { key: scoped.key },
    { key: adminScoped.key },
  ]) {
    for (const foreign of [a2, b]) {
      await status(`${base}/conversations/${foreign.conversation.id}`, 404, credential)
      await status(`${conv}/messages/${foreign.message.id}`, 404, credential)
      await status(`${conv}/media/${foreign.media.id}/content`, 404, credential)
      await status(`${base}/webhook/${foreign.webhook.id}`, 404, credential)
      await status(`${base}/webhook/${a.webhook.id}/logs/${foreign.log.id}`, 404, credential)
      for (const format of ['base64', 'binary']) {
        await status(`${base}/message/${foreign.message.messageId}/media/${format}`, 404, credential)
      }
    }
  }
  const scopedList = (await (await status('/api/v1/session', 200, { key: scoped.key })).json()) as {
    data: { id: string }[]
    total: number
  }
  assert.equal(scopedList.total, 1)
  assert.deepEqual(
    scopedList.data.map((item) => item.id),
    [a.id],
  )
  const globalList = (await (await status('/api/v1/session', 200, { key: global.key })).json()) as {
    data: { id: string }[]
    total: number
  }
  assert.equal(globalList.total, 2)
  assert.deepEqual(globalList.data.map((item) => item.id).sort(), [a.id, a2.id].sort())
  for (const path of [
    'conversations',
    'contacts',
    'conversation-labels',
    'quick-messages',
    'webhook',
  ]) {
    const text = await (await status(`${base}/${path}`, 200, { key: scoped.key })).text()
    assert.ok(!text.includes(a2.id) && !text.includes(b.id), path)
  }
  const content = `${conv}/media/${a.media.id}/content`
  assert.equal(await (await status(content, 200, { key: scoped.key })).text(), 'bytes-session-a')
  const range = await status(content, 206, { key: scoped.key, headers: { range: 'bytes=0-4' } })
  assert.equal(await range.text(), 'bytes')
  assert.equal(range.headers.get('content-range'), 'bytes 0-4/15')
  assert.equal((await status(content, 200, { method: 'HEAD', key: scoped.key })).body, null)
  const integrationMedia = `${base}/message/${a.message.messageId}/media`
  const base64 = await status(`${integrationMedia}/base64`, 200, { key: scoped.key })
  const base64Body = await base64.json()
  assert.equal(base64Body.status, 'success')
  assert.equal(base64Body.data.media, Buffer.from('bytes-session-a').toString('base64'))
  const binary = await status(`${integrationMedia}/binary`, 200, { key: scoped.key })
  assert.equal(await binary.text(), 'bytes-session-a')
  const binaryRange = await status(`${integrationMedia}/binary`, 206, { key: scoped.key, headers: { range: 'bytes=0-4' } })
  assert.equal(await binaryRange.text(), 'bytes')
  assert.equal(binaryRange.headers.get('content-range'), 'bytes 0-4/15')
  const list = await mcpCall(global.key, 'user', undefined, 'list_sessions', {})
  assert.ok(JSON.stringify(list).includes(a.id))
  assert.ok(!JSON.stringify(list).includes(b.id))
  const ownSession = await mcpCall(global.key, 'user', undefined, 'get_session', {
    sessionId: a.id,
  })
  assert.ok(JSON.stringify(ownSession).includes(a.id))
  const denied = await mcpCall(global.key, 'user', undefined, 'get_session', { sessionId: b.id })
  assert.equal(denied.result?.isError, true)
  assert.ok(!JSON.stringify(denied).includes(b.id))
  const log = await mcpCall(scoped.key, 'session', a.id, 'get_webhook_log', {
    webhookId: a.webhook.id,
    logId: a.log.id,
  })
  assert.ok(JSON.stringify(log).includes('log-session-a'))
  const foreignLog = await mcpCall(scoped.key, 'session', a.id, 'get_webhook_log', {
    webhookId: a.webhook.id,
    logId: b.log.id,
  })
  assert.equal(foreignLog.result?.isError, true)
  assert.ok(!JSON.stringify(foreignLog).includes('log-session-b'))
  const foreignWebhook = await mcpCall(scoped.key, 'session', a.id, 'get_webhook_log', {
    webhookId: b.webhook.id,
    logId: b.log.id,
  })
  assert.equal(foreignWebhook.result?.isError, true)
  assert.ok(!JSON.stringify(foreignWebhook).includes('log-session-b'))
  const override = await mcpCall(scoped.key, 'session', a.id, 'get_webhook_log', {
    webhookId: a.webhook.id,
    logId: a.log.id,
    sessionId: b.id,
  })
  assert.ok(override.error || override.result?.isError)
  await verifyRealtime({
    ownerId: owner.id,
    otherId: other.id,
    adminId: admin.id,
    adminCookie,
    scoped,
    adminScoped,
    global,
    a,
    a2,
    b,
  })
  await prisma.apikey.delete({ where: { id: scoped.id } })
  await status(conv, 401, { key: scoped.key })
  await prisma.user.update({ where: { id: owner.id }, data: { banned: true } })
  await status(conv, 401, { key: global.key })
} finally {
  await prisma.$disconnect()
}
