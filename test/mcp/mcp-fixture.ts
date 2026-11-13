import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import jwt from 'jsonwebtoken'
import { DateTime } from 'luxon'
import { z } from 'zod'

const ToolResult = z.object({
  result: z.object({
    isError: z.boolean().optional(),
    content: z.array(z.object({ text: z.string() })).min(1),
  }),
})
const ToolList = z.object({
  result: z.object({
    tools: z.array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        annotations: z.object({ readOnlyHint: z.boolean(), destructiveHint: z.boolean() }),
        inputSchema: z.object({
          properties: z.record(z.string(), z.unknown()),
        }),
      }),
    ),
  }),
})
const InitializeResult = z.object({
  result: z.object({ serverInfo: z.object({ name: z.string() }) }),
})

const sessions = {
  a: { id: 'a', userId: 'owner', secret: 'secret-a', user: { banned: false }, token: jwt.sign({ sub: 'a' }, 'secret-a', { algorithm: 'HS256' }) },
  b: { id: 'b', userId: 'other', secret: 'secret-b', user: { banned: false }, token: jwt.sign({ sub: 'b' }, 'secret-b', { algorithm: 'HS256' }) },
}
const users = {
  admin: { id: 'admin', role: 'ADMIN' },
  owner: { id: 'owner', role: 'USER' },
  other: { id: 'other', role: 'USER' },
}
const calls: unknown[][] = []
const groupData = Object.fromEntries(
  ['a', 'b'].map((id) => [
    id,
    [
      {
        id: 'group',
        subject: 'First group',
        owner: 'owner@example.com',
        participants: [{ id: `${id}-participant` }],
      },
      {
        id: 'large-group',
        subject: 'Large group',
        creation: 123456,
        participants: Array.from({ length: 100 }, (_, index) => ({
          id: `${id}-member-${index}`,
          admin: index === 0 ? 'admin' : null,
        })),
      },
    ],
  ]),
)
let enabled = true
let connected = true
let failure = ''
let editFailure = ''
mock.module('@server/modules/whatsapp-messages/edit-service.ts', () => ({
  editWhatsappTextMessage: async (...args: unknown[]) => {
    calls.push(['edit-message', ...args])
    if (editFailure === 'known') {
      const { AppError } = await import('../../server/src/common/errors/app-error.ts')
      throw new AppError({ status: 409, code: 'MESSAGE_NOT_EDITABLE', message: 'Message cannot be edited' })
    }
    if (editFailure === 'unknown') throw new Error('private edit failure')
    return { id: 'record', messageId: args[1], text: (args[2] as { text: string }).text, editedAt: '2026-11-11T14:00:00.000Z' }
  },
}))
mock.module('@server/lib/auth.ts', () => ({
  auth: {
    api: {
      verifyApiKey: async ({ body }: { body: { key: string } }) => ({
        valid: body.key in users || ['scoped-a', 'scoped-b'].includes(body.key),
        key: body.key in users ? { referenceId: body.key, permissions: { global: ['sessions'] } }
          : body.key === 'scoped-a' ? { referenceId: 'owner', permissions: { sessions: ['a'] } }
            : body.key === 'scoped-b' ? { referenceId: 'other', permissions: { sessions: ['b'] } } : null,
      }),
      getSession: async ({ headers }: { headers: Headers }) => {
        const id = headers.get('cookie')?.replace('session=', '') ?? ''
        return id in users ? { user: { id } } : null
      },
    },
  },
}))
mock.module('@db/prisma', () => ({
  prisma: {
    waSession: {
      findUnique: async ({ where }: { where: { id: keyof typeof sessions } }) =>
        sessions[where.id] ?? null,
    },
    user: {
      findUnique: async ({ where }: { where: { id: keyof typeof users } }) =>
        users[where.id] ?? null,
    },
  },
}))
mock.module('@services/whatsapp.ts', () => ({
  whatsappService: {
    isSessionEnabled: () => enabled,
    isSessionConnected: () => connected,
  },
}))
mock.module('@server/modules/whatsapp-groups/service.ts', () => ({
  listGroups: async (id: string) => {
    calls.push(['groups', id])
    return groupData[id] ?? []
  },
  updateGroupParticipants: async (...args: unknown[]) => {
    calls.push(args)
    return { ok: true }
  },
}))
mock.module('@server/modules/whatsapp-messages/service.ts', () => ({
  sendTextMessage: async (...args: unknown[]) => {
    calls.push(args)
    if (failure === 'known') {
      const { BadRequestError } = await import(
        '../../server/src/common/errors/bad-request-error.ts'
      )
      throw new BadRequestError('Known failure')
    }
    if (failure === 'unknown') throw new Error('private secret')
    return { ok: true }
  },
}))
mock.module('@server/modules/sessions/service.ts', () => ({
  getSessions: async (...args: unknown[]) => {
    calls.push(['sessions', ...args])
    return { data: [{ id: 'a' }], total: 1 }
  },
  createSession: async (...args: unknown[]) => {
    calls.push(['create-session', ...args])
    return { id: 'created' }
  },
  getSessionById: async (id: string) => ({ id }),
  updateSession: async (...args: unknown[]) => {
    calls.push(['update-session', ...args])
    return { id: args[1] }
  },
  removeSession: async (...args: unknown[]) => {
    calls.push(['remove-session', ...args])
    return { ok: true }
  },
  connectSession: async (...args: unknown[]) => {
    calls.push(['connect-session', ...args])
    return { ok: true }
  },
  logoutSession: async (...args: unknown[]) => {
    calls.push(['logout-session', ...args])
    return { ok: true }
  },
}))
mock.module('@server/modules/webhooks/service.ts', () => ({
  getWebhooks: async (...args: unknown[]) => {
    calls.push(args)
    return { data: [], sessionId: args[0], pagination: args[1] }
  },
  getWebhookLogs: async (...args: unknown[]) => {
    calls.push(['get-logs', ...args])
    if (args[1] === 'missing') {
      const { NotFoundError } = await import('../../server/src/common/errors/not-found-error.ts')
      throw new NotFoundError('Webhook not found')
    }
    return { data: [{ id: 'log' }] }
  },
  getWebhookLogById: async (...args: unknown[]) => {
    calls.push(['get-log', ...args])
    if (args[2] === 'missing') {
      const { NotFoundError } = await import('../../server/src/common/errors/not-found-error.ts')
      throw new NotFoundError('Webhook log not found')
    }
    return { id: args[2], payload: { event: 'test' } }
  },
  retryWebhookLog: async (...args: unknown[]) => {
    calls.push(['retry-log', ...args])
    if ((args[0] as { logId: string }).logId === 'missing') {
      const { NotFoundError } = await import('../../server/src/common/errors/not-found-error.ts')
      throw new NotFoundError('Webhook log not found')
    }
    return { id: 'new-log' }
  },
}))
mock.module('@server/modules/whatsapp-actions/service.ts', () => ({
  ...Object.fromEntries(['getDisplayPicture', 'updateDisplayPicture', 'updateProfileStatus', 'updateProfileName', 'isOnWhatsApp', 'getAbout', 'blockContact', 'unblockContact'].map(name => [name, async (...args: unknown[]) => {
    calls.push([name, ...args])
    return name === 'isOnWhatsApp' ? true : { ok: true }
  }])),
}))

const { default: createApp } = await import('../../server/src/create-app.ts')
const { errorHandler } = await import('../../server/src/common/http/error-handler.ts')
const { default: router } = await import('../../server/src/modules/mcp/route.ts')
const app = createApp()
app.onError(errorHandler)
app.route('/', router)
let clientIp = 'initial-scenarios'
function token(subject: string, secret: string) {
  const session = subject === 'a' ? sessions.a : sessions.b
  return session.secret === secret ? session.token : jwt.sign({ sub: subject }, secret)
}
async function request(
  method: string,
  params: object = {},
  options: {
    session?: string
    auth?: string | null
    host?: string
    origin?: string
    preset?: string
    apiKey?: string
    cookie?: string
    query?: string
  } = {},
) {
  const headers: Record<string, string> = {
    host: options.host ?? 'localhost',
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'x-zappaz-preset': options.preset ?? 'session',
  }
  if (options.auth) headers.authorization = options.auth
  if (options.auth === undefined && !options.cookie && !options.apiKey)
    headers['x-api-key'] = options.session === 'b' ? 'scoped-b' : 'scoped-a'
  if (options.session !== '') headers['x-zappaz-session-id'] = options.session ?? 'a'
  if (options.apiKey) headers['x-api-key'] = options.apiKey
  if (options.cookie) headers.cookie = options.cookie
  if (options.origin) headers.origin = options.origin
  const response = await app.request(`http://localhost/mcp${options.query ?? ''}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }, { clientIp })
  const text = await response.text()
  let body: unknown
  try {
    body = JSON.parse(text.startsWith('event:') ? (text.match(/data: (.*)/)?.[1] ?? text) : text)
  } catch {
    body = text
  }
  return { status: response.status, body }
}
async function call(name: string, args: object = {}, options = {}) {
  const response = await request('tools/call', { name, arguments: args }, options)
  assert.equal(response.status, 200, JSON.stringify(response))
  return ToolResult.parse(response.body).result
}
const init = await request('initialize', {
  protocolVersion: '2025-03-26',
  capabilities: {},
  clientInfo: { name: 'test', version: '1' },
})
assert.equal(init.status, 200, JSON.stringify(init))
assert.equal(InitializeResult.parse(init.body).result.serverInfo.name, 'zappaz-lite')
const list = await request('tools/list')
assert.equal(list.status, 200)
const tools = ToolList.parse(list.body).result.tools
const names = tools.map((tool) => tool.name).sort()
assert.deepEqual(
  names,
  [
    'send_text_message',
    'send_image_message',
    'send_video_message',
    'send_audio_message',
    'send_document_message',
    'send_contact_message',
    'send_location_message',
    'delete_message',
    'edit_message',
    'list_groups',
    'get_group_participants',
    'create_group',
    'update_group',
    'add_participants',
    'remove_participants',
    'promote_participants',
    'demote_participants',
    'send_group_invite_link',
    'update_group_picture',
    'get_webhooks',
    'get_webhook_logs',
    'get_webhook_log',
    'retry_webhook_log',
    'create_webhook',
    'update_webhook',
    'delete_webhook',
    'get_display_picture',
    'update_display_picture',
    'update_profile_status',
    'update_profile_name',
    'is_on_whatsapp',
    'get_about',
    'block_contact',
    'unblock_contact',
  ].sort(),
)
for (const tool of tools) {
  assert.ok(!('sessionId' in tool.inputSchema.properties), tool.name)
  assert.ok(!('token' in tool.inputSchema.properties), tool.name)
  assert.ok(tool.description?.trim(), `${tool.name} must have a description`)
}
for (const name of [
  'send_image_message',
  'send_video_message',
  'send_audio_message',
  'send_document_message',
  'update_group_picture',
]) {
  const tool = tools.find((item) => item.name === name)
  assert.match(tool?.description ?? '', /URL/i, name)
  assert.match(tool?.description ?? '', /base64/i, name)
  const data = z
    .object({
      properties: z.object({
        source: z.object({ description: z.string() }),
      }),
    })
    .parse(tool?.inputSchema.properties.data)
  assert.match(data.properties.source.description, /URL/i, name)
  assert.match(data.properties.source.description, /base64/i, name)
}
assert.match(
  tools.find((tool) => tool.name === 'list_groups')?.description ?? '',
  /get_group_participants/,
)
assert.equal((await request('tools/list', {}, { session: '' })).status, 400)
assert.equal((await request('tools/list', {}, { session: '   ' })).status, 400)
assert.equal((await request('tools/list', {}, { auth: null })).status, 401)
assert.equal((await request('tools/list', {}, { auth: 'invalid' })).status, 401)
assert.equal((await request('tools/list', {}, { session: 'missing' })).status, 401)
assert.equal((await request('tools/list', {}, { auth: 'Bearer invalid-user-token' })).status, 401)
assert.equal(
  (await request('tools/list', {}, { auth: `Bearer ${token('b', 'secret-b')}` })).status,
  401,
)
for (const auth of [token('a', 'secret-a'), `Bearer ${token('a', 'secret-a')}`]) {
  assert.equal((await request('tools/list', {}, { auth })).status, 401)
}
assert.equal((await request('tools/list', {}, { host: 'evil.example' })).status, 403)
assert.equal((await request('tools/list', {}, { origin: 'https://evil.example' })).status, 403)
assert.equal(
  (await request('tools/list', {}, { host: '127.0.0.1', origin: 'http://localhost:3000' })).status,
  200,
)
const expectedGroups = [
  { id: 'group', subject: 'First group', owner: 'owner@example.com' },
  { id: 'large-group', subject: 'Large group', creation: 123456 },
]
const firstList = await call('list_groups')
assert.deepEqual(JSON.parse(firstList.content[0].text), expectedGroups)
const selectedParticipants = await call('get_group_participants', {
  groupId: 'large-group',
})
assert.deepEqual(
  JSON.parse(selectedParticipants.content[0].text),
  Array.from({ length: 100 }, (_, index) => ({
    id: `a-member-${index}`,
    admin: index === 0 ? 'admin' : null,
  })),
)
const secondList = await call('list_groups')
assert.deepEqual(JSON.parse(secondList.content[0].text), expectedGroups)
assert.deepEqual(groupData.a[1].participants, JSON.parse(selectedParticipants.content[0].text))
const resultA = await call('get_group_participants', {
  groupId: 'group',
  sessionId: 'b',
})
const resultB = await call(
  'get_group_participants',
  { groupId: 'group', sessionId: 'a' },
  { session: 'b' },
)
assert.equal(resultA.isError, true)
assert.equal(resultB.isError, true)
assert.deepEqual(
  JSON.parse((await call('get_group_participants', { groupId: 'group' })).content[0].text),
  [{ id: 'a-participant' }],
)
assert.deepEqual(
  JSON.parse(
    (await call('get_group_participants', { groupId: 'group' }, { session: 'b' })).content[0].text,
  ),
  [{ id: 'b-participant' }],
)
const missingGroup = await call('get_group_participants', {
  groupId: 'missing',
})
assert.equal(missingGroup.isError, true)
assert.equal(missingGroup.content[0].text, 'Group not found')
const before = calls.length
const invalid = await call('add_participants', { groupId: 'group', data: [] })
assert.equal(invalid.isError, true)
assert.equal(calls.length, before)
const invalidPage = await call('get_webhooks', { page: 0, pageSize: 101 })
assert.equal(invalidPage.isError, true)
assert.equal(calls.length, before)
await call('add_participants', { groupId: 'group', data: ['123'] })
assert.deepEqual(calls.at(-1), ['a', 'group', ['123'], 'add'])
enabled = false
const disabled = await call('list_groups')
assert.equal(disabled.isError, true)
assert.equal(disabled.content[0].text, 'Session not enabled')
enabled = true
connected = false
const disconnected = await call('list_groups')
assert.equal(disconnected.isError, true)
assert.equal(disconnected.content[0].text, 'Session not connected')
const hooks = await call('get_webhooks')
assert.deepEqual(JSON.parse(hooks.content[0].text), {
  data: [],
  sessionId: 'a',
  pagination: { page: '1', pageSize: '100' },
})
await call('get_webhooks', { page: 2, pageSize: 10 })
assert.deepEqual(calls.at(-1), ['a', { page: '2', pageSize: '10' }])
connected = true
failure = 'known'
let error = await call('send_text_message', {
  data: { number: '123', message: 'hello' },
})
assert.equal(error.isError, true)
assert.equal(error.content[0].text, 'Known failure')
failure = 'unknown'
error = await call('send_text_message', {
  data: { number: '123', message: 'hello' },
})
assert.equal(error.isError, true)
assert.equal(error.content[0].text, 'Unable to complete operation')

// The user preset is authenticated as an account, not as a WhatsApp session.
assert.equal(
  (await request('tools/list', {}, { preset: '', auth: null, apiKey: 'owner' })).status,
  400,
)
assert.equal(
  (await request('tools/list', {}, { session: 'a', auth: null, apiKey: 'owner' })).status,
  200,
)
const ownedGroups = await call('list_groups', {}, { session: 'a', auth: null, apiKey: 'owner' })
assert.deepEqual(JSON.parse(ownedGroups.content[0].text), expectedGroups)
const beforeForeignSession = calls.length
assert.equal(
  (await request('tools/list', {}, { session: 'b', auth: null, apiKey: 'owner' })).status,
  401,
)
assert.equal(
  (
    await request(
      'tools/call',
      { name: 'list_groups', arguments: {} },
      { session: 'b', auth: null, apiKey: 'owner' },
    )
  ).status,
  401,
)
assert.equal(calls.length, beforeForeignSession)
assert.equal(
  (await request('tools/list', {}, { session: 'b', auth: null, apiKey: 'admin' })).status,
  200,
)

const userOptions = { preset: 'user', session: '', auth: null, apiKey: 'owner' }
const editArgs = { messageId: 'wa-original', data: { text: 'Texto atualizado' } }
const editTool = tools.find((tool) => tool.name === 'edit_message')
assert.deepEqual(editTool?.annotations, { readOnlyHint: false, destructiveHint: true })
for (const [args, options, session] of [
  [editArgs, {}, 'a'],
  [editArgs, { session: 'b', auth: null, apiKey: 'scoped-b' }, 'b'],
  [{ ...editArgs, sessionId: 'a' }, userOptions, 'a'],
] as const) {
  const result = await call('edit_message', args, options)
  assert.notEqual(result.isError, true)
  assert.deepEqual(calls.at(-1), ['edit-message', session, 'wa-original', editArgs.data])
  assert.deepEqual(JSON.parse(result.content[0].text), { id: 'record', messageId: 'wa-original', text: 'Texto atualizado', editedAt: '2026-11-11T14:00:00.000Z' })
}
const beforeInvalidEdits = calls.length
for (const data of [{ text: '' }, { text: ' \n ' }, { text: 'x'.repeat(65537) }, { text: 'Ok', extra: true }]) {
  assert.equal((await call('edit_message', { ...editArgs, data })).isError, true)
}
assert.equal((await call('edit_message', { ...editArgs, sessionId: 'b' })).isError, true)
assert.equal((await call('edit_message', editArgs, userOptions)).isError, true)
assert.equal((await call('edit_message', { ...editArgs, sessionId: 'b' }, userOptions)).isError, true)
assert.equal(calls.length, beforeInvalidEdits)
enabled = false
assert.equal((await call('edit_message', editArgs)).isError, true)
enabled = true; connected = false
assert.equal((await call('edit_message', editArgs)).isError, true)
connected = true
assert.equal(calls.length, beforeInvalidEdits)
editFailure = 'known'
const knownEdit = await call('edit_message', editArgs)
assert.equal(knownEdit.isError, true)
assert.equal(knownEdit.content[0].text, 'Message cannot be edited')
editFailure = 'unknown'
const unknownEdit = await call('edit_message', editArgs)
assert.equal(unknownEdit.isError, true)
assert.equal(unknownEdit.content[0].text, 'Unable to complete operation')
editFailure = ''
const actionCases = [
  { name: 'get_display_picture', service: 'getDisplayPicture', input: { identifier: '5511999999999' }, expected: { identifier: '5511999999999' }, readOnly: true },
  { name: 'update_display_picture', service: 'updateDisplayPicture', input: { data: { identifier: '5511999999999', source: 'https://example.com/photo.jpg' } }, expected: { identifier: '5511999999999', source: 'https://example.com/photo.jpg' }, readOnly: false },
  { name: 'update_profile_status', service: 'updateProfileStatus', input: { data: { status: 'Disponível' } }, expected: { status: 'Disponível' }, readOnly: false },
  { name: 'update_profile_name', service: 'updateProfileName', input: { data: { name: 'Zappaz' } }, expected: { name: 'Zappaz' }, readOnly: false },
  { name: 'is_on_whatsapp', service: 'isOnWhatsApp', input: { jid: '5511999999999' }, expected: '5511999999999', readOnly: true },
  { name: 'get_about', service: 'getAbout', input: { jid: '5511999999999' }, expected: '5511999999999', readOnly: true },
  { name: 'block_contact', service: 'blockContact', input: { jid: '5511999999999' }, expected: '5511999999999', readOnly: false },
  { name: 'unblock_contact', service: 'unblockContact', input: { jid: '5511999999999' }, expected: '5511999999999', readOnly: false },
]
for (const action of actionCases) {
  clientIp = `action-scenario-${action.name}`
  assert.equal(tools.find(tool => tool.name === action.name)?.annotations.readOnlyHint, action.readOnly)
  if (!action.readOnly) assert.equal(tools.find(tool => tool.name === action.name)?.annotations.destructiveHint, true)
  for (const session of ['a', 'b']) {
    const result = await call(action.name, action.input, { session })
    assert.ok(!result.isError, action.name)
    assert.deepEqual(calls.at(-1), [action.service, session, action.expected])
    if (action.name === 'is_on_whatsapp') assert.deepEqual(JSON.parse(result.content[0].text), { isOnWhatsApp: true })
  }
  const before = calls.length
  assert.equal((await call(action.name, { ...action.input, sessionId: 'b' })).isError, true)
  assert.equal((await call(action.name, { ...action.input, sessionId: 'b' }, userOptions)).isError, true)
  assert.equal((await call(action.name, action.input, userOptions)).isError, true)
  assert.equal((await call(action.name, {})).isError, true)
  enabled = false
  assert.equal((await call(action.name, action.input)).content[0].text, 'Session not enabled')
  enabled = true
  connected = false
  assert.equal((await call(action.name, action.input)).content[0].text, 'Session not connected')
  connected = true
  assert.equal(calls.length, before)
  await call(action.name, { ...action.input, sessionId: 'a' }, userOptions)
  assert.deepEqual(calls.at(-1), [action.service, 'a', action.expected])
  await call(action.name, { ...action.input, sessionId: 'b' }, { ...userOptions, apiKey: 'admin' })
  assert.deepEqual(calls.at(-1), [action.service, 'b', action.expected])
}
for (const [name, data] of [['update_profile_name', { name: '' }], ['update_profile_status', { status: '' }]] as const) {
  const before = calls.length
  assert.equal((await call(name, { data })).isError, true)
  assert.equal(calls.length, before)
}
clientIp = 'remaining-scenarios'
assert.equal((await request('tools/list', {}, { ...userOptions, session: 'a' })).status, 400)
const userList = await request('tools/list', {}, userOptions)
assert.equal(userList.status, 200, JSON.stringify(userList))
const userTools = ToolList.parse(userList.body).result.tools
for (const name of names) {
  const tool = userTools.find((item) => item.name === name)
  assert.ok(tool, name)
  assert.ok('sessionId' in tool.inputSchema.properties, name)
}
for (const name of [
  'list_sessions',
  'create_session',
  'get_session',
  'update_session',
  'delete_session',
  'connect_session',
  'logout_session',
]) {
  assert.ok(
    userTools.some((tool) => tool.name === name),
    name,
  )
  assert.ok(!names.includes(name), name)
}
assert.equal(
  (await request('tools/list', {}, { preset: 'user', session: '', auth: null })).status,
  401,
)
assert.equal(
  (
    await request(
      'tools/list',
      {},
      { preset: 'user', session: '', auth: `Bearer ${token('a', 'secret-a')}` },
    )
  ).status,
  401,
)
assert.equal((await request('tools/list', {}, { ...userOptions, apiKey: 'invalid' })).status, 401)
assert.equal(
  (
    await request(
      'tools/list',
      {},
      {
        preset: 'user',
        session: '',
        auth: null,
        cookie: 'session=owner',
        origin: 'http://localhost:5173',
      },
    )
  ).status,
  200,
)
assert.equal(
  (
    await request(
      'tools/list',
      {},
      {
        preset: 'user',
        session: '',
        auth: null,
        cookie: 'session=owner',
        origin: 'https://evil.example',
      },
    )
  ).status,
  403,
)
assert.equal(
  (await request('tools/list', {}, { preset: 'invalid', auth: null, apiKey: 'owner' })).status,
  400,
)
assert.equal((await request('tools/list', {}, { session: '', query: '?sessionId=a' })).status, 400)

const userSessions = await call('list_sessions', {}, userOptions)
assert.deepEqual(JSON.parse(userSessions.content[0].text), { data: [{ id: 'a' }], total: 1 })
const sessionListCall = calls.at(-1)
assert.equal(sessionListCall?.[0], 'sessions')
assert.equal((sessionListCall?.[1] as { user: { id: string } }).user.id, 'owner')

const userGroups = await call('list_groups', { sessionId: 'a' }, userOptions)
assert.deepEqual(JSON.parse(userGroups.content[0].text), expectedGroups)
const callsBeforeUnauthorized = calls.length
const foreign = await call('list_groups', { sessionId: 'b' }, userOptions)
assert.equal(foreign.isError, true)
assert.equal(calls.length, callsBeforeUnauthorized)
const missingSessionArgument = await call('list_groups', {}, userOptions)
assert.equal(missingSessionArgument.isError, true)
assert.equal(calls.length, callsBeforeUnauthorized)
const adminGroups = await call(
  'list_groups',
  { sessionId: 'b' },
  { ...userOptions, apiKey: 'admin' },
)
assert.deepEqual(JSON.parse(adminGroups.content[0].text), expectedGroups)
// Re-read role and ownership for subsequent requests rather than caching access.
sessions.a.userId = 'other'
const revoked = await call('list_groups', { sessionId: 'a' }, userOptions)
assert.equal(revoked.isError, true)
sessions.a.userId = 'owner'

users.owner.role = 'REVOKED'
assert.equal((await request('tools/list', {}, userOptions)).status, 403)
users.owner.role = 'USER'

// Webhook log tools remain session-scoped even when WhatsApp is offline.
const logTools = [
  { name: 'get_webhook_logs', args: { webhookId: 'hook' }, readOnly: true },
  { name: 'get_webhook_log', args: { webhookId: 'hook', logId: 'log' }, readOnly: true },
  { name: 'retry_webhook_log', args: { webhookId: 'hook', logId: 'log' }, readOnly: false },
] as const
for (const { name, args, readOnly } of logTools) {
  clientIp = `webhook-log-${name}`
  for (const catalog of [tools, userTools]) {
    const entry = catalog.find((item) => item.name === name)
    assert.ok(entry, name)
    assert.deepEqual(entry.annotations, { readOnlyHint: readOnly, destructiveHint: !readOnly })
  }
  const before = calls.length
  assert.equal((await call(name, { ...args, sessionId: 'b' })).isError, true)
  assert.equal((await call(name, { ...args, sessionId: 'b' }, userOptions)).isError, true)
  assert.equal((await call(name, args, userOptions)).isError, true)
  assert.equal((await call(name, { ...args, webhookId: '' })).isError, true)
  if ('logId' in args) assert.equal((await call(name, { ...args, logId: '' })).isError, true)
  assert.equal(calls.length, before)
  enabled = false
  connected = false
  assert.ok(!(await call(name, args)).isError, name)
  assert.ok(!(await call(name, { ...args, sessionId: 'a' }, userOptions)).isError, name)
  enabled = true
  connected = true
}

clientIp = 'webhook-log-pagination'
const start = DateTime.now()
const defaultLogs = await call('get_webhook_logs', { webhookId: 'hook' })
const end = DateTime.now()
assert.deepEqual(JSON.parse(defaultLogs.content[0].text), { data: [{ id: 'log' }] })
const defaultCall = calls.at(-1)
assert.deepEqual(defaultCall?.slice(0, 3), ['get-logs', 'a', 'hook'])
const defaults = z.object({ page: z.string(), pageSize: z.string(), startDate: z.string(), endDate: z.string() }).parse(defaultCall?.[3])
assert.equal(defaults.page, '1')
assert.equal(defaults.pageSize, '100')
assert.ok(DateTime.fromISO(defaults.startDate).toMillis() >= start.minus({ days: 30 }).startOf('day').toMillis())
assert.ok(DateTime.fromISO(defaults.startDate).toMillis() <= end.minus({ days: 30 }).startOf('day').toMillis())
assert.ok(DateTime.fromISO(defaults.endDate).toMillis() >= start.endOf('day').toMillis())
assert.ok(DateTime.fromISO(defaults.endDate).toMillis() <= end.endOf('day').toMillis())
const filters = { event: 'messages.send', status: 'failed', startDate: '2026-01-01', endDate: '2026-01-31' }
await call('get_webhook_logs', { sessionId: 'a', webhookId: 'hook', page: 10000, pageSize: 100, ...filters }, userOptions)
assert.deepEqual(calls.at(-1), ['get-logs', 'a', 'hook', { ...filters, page: '10000', pageSize: '100' }])

for (const pagination of [{ page: 0 }, { page: -1 }, { page: 1.5 }, { page: 10001 }, { page: '1' }, { pageSize: 0 }, { pageSize: 101 }, { pageSize: 1.5 }, { pageSize: '10' }]) {
  const before = calls.length
  assert.equal((await call('get_webhook_logs', { webhookId: 'hook', ...pagination })).isError, true)
  assert.equal(calls.length, before)
}
clientIp = 'webhook-log-detail'
const detail = await call('get_webhook_log', { webhookId: 'hook', logId: 'log' })
assert.deepEqual(JSON.parse(detail.content[0].text), { id: 'log', payload: { event: 'test' } })
assert.deepEqual(calls.at(-1), ['get-log', 'a', 'hook', 'log'])
const retry = await call('retry_webhook_log', { sessionId: 'a', webhookId: 'hook', logId: 'log' }, userOptions)
assert.deepEqual(JSON.parse(retry.content[0].text), { id: 'new-log' })
assert.deepEqual(calls.at(-1), ['retry-log', { sessionId: 'a', webhookId: 'hook', logId: 'log' }])
for (const name of ['get_webhook_log', 'retry_webhook_log']) {
  const missing = await call(name, { webhookId: 'hook', logId: 'missing' })
  assert.equal(missing.isError, true)
  assert.equal(missing.content[0].text, 'Webhook log not found')
}
const missingWebhook = await call('get_webhook_logs', { webhookId: 'missing' })
assert.equal(missingWebhook.isError, true)
assert.equal(missingWebhook.content[0].text, 'Webhook not found')
