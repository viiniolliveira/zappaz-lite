import assert from 'node:assert/strict'
import { hashPassword } from 'better-auth/crypto'
import { errorHandler } from '../../server/src/common/http/error-handler.ts'
import createApp from '../../server/src/create-app.ts'
import { prisma } from '../../server/src/db/prisma.ts'
import {
  authMiddleware,
  requireMcpAccess,
  requireSession,
  requireSessionAuth,
} from '../../server/src/middleware/auth.ts'
import { requireRole } from '../../server/src/middleware/role.ts'
import authRouter from '../../server/src/modules/auth/route.ts'
import { apiSessionsRouter } from '../../server/src/modules/sessions/route.ts'

const app = createApp()
app.onError(errorHandler)
app.route('/', authRouter)
app.route('/api/v1', apiSessionsRouter)
app.post('/test/user', authMiddleware, (c) => c.json({ userId: c.get('user').id }))
app.get('/test/admin', authMiddleware, requireRole(['admin']), (c) => c.json({ ok: true }))
app.post('/test/session/:sessionId', requireSession, requireSessionAuth, (c) =>
  c.json({ id: c.get('session').id }),
)
app.post('/test/mcp', requireMcpAccess, (c) => c.json({ id: c.get('session').id }))
const password = 'initial-password-123'
const origin = 'http://localhost:3001'
async function createUser(email: string, role: 'USER' | 'ADMIN') {
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
async function request(
  path: string,
  options: {
    method?: string
    body?: unknown
    cookie?: string
    origin?: string
    apiKey?: string
    bearer?: string
  } = {},
) {
  return app.request(
    `http://localhost:3001${path}`,
    {
      method: options.method ?? 'GET',
      headers: {
        ...(options.origin === '' ? {} : { origin: options.origin ?? origin }),
        ...(options.apiKey !== undefined ? { 'x-api-key': options.apiKey } : {}),
        ...(options.bearer ? { authorization: `Bearer ${options.bearer}` } : {}),
        ...(options.cookie ? { cookie: options.cookie } : {}),
        ...(options.body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    },
    { clientIp: '127.0.0.1' },
  )
}
async function login(email: string, pass = password) {
  const res = await request('/api/auth/sign-in/email', {
    method: 'POST',
    body: { email, password: pass },
  })
  assert.equal(res.status, 200, `login ${email}: ${await res.clone().text()}`)
  const setCookie = res.headers.getSetCookie()
  const sessionCookie = setCookie.find((value) => /session_token=/.test(value))
  assert.ok(sessionCookie, JSON.stringify(setCookie))
  assert.match(sessionCookie, /httponly/i)
  assert.match(sessionCookie, /samesite=lax/i)
  return sessionCookie.split(';')[0]
}
try {
  const admin = await createUser('admin@example.test', 'ADMIN')
  const user = await createUser('user@example.test', 'USER')
  const other = await createUser('other@example.test', 'USER')
  // Exercise the real Better Auth parser through createApp's lazy request limiter.
  async function streamedLogin(
    body: string,
    options: { length?: number; origin?: string; cookie?: string } = {},
  ) {
    const bytes = new TextEncoder().encode(body)
    let offset = 0
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (offset === bytes.length) return controller.close()
          const next = Math.min(offset + 4096, bytes.length)
          controller.enqueue(bytes.slice(offset, next))
          offset = next
        },
      },
      { highWaterMark: 0 },
    )
    return app.fetch(
      new Request('http://localhost:3001/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          ...(options.origin === '' ? {} : { origin: options.origin ?? origin }),
          'content-type': 'application/json',
          ...(options.length === undefined ? {} : { 'content-length': String(options.length) }),
          ...(options.cookie ? { cookie: options.cookie } : {}),
        },
        body: stream,
      }),
      { clientIp: '127.0.0.1' },
    )
  }
  const sessionCount = () => prisma.authSession.count({ where: { userId: user.id } })
  const beforeStreamedLogin = await sessionCount()
  const oversized = JSON.stringify({ email: user.email, password, padding: 'x'.repeat(16 * 1024) })
  for (const length of [undefined, 1]) {
    const response = await streamedLogin(oversized, { length })
    assert.equal(response.status, 413, `oversized login with content-length ${length}`)
    assert.equal(await sessionCount(), beforeStreamedLogin)
  }
  const validBody = JSON.stringify({ email: user.email, password })
  const foreignWithoutCookie = await streamedLogin(validBody, { origin: 'https://evil.test' })
  assert.equal(foreignWithoutCookie.status, 403)
  assert.equal(await sessionCount(), beforeStreamedLogin)
  const foreign = await streamedLogin(validBody, {
    origin: 'https://evil.test',
    cookie: 'test=synthetic',
  })
  assert.equal(foreign.status, 403)
  assert.equal(await sessionCount(), beforeStreamedLogin)
  const invalid = await streamedLogin(JSON.stringify({ email: user.email, password: 'wrong' }))
  assert.equal(invalid.status, 401)
  assert.equal(await sessionCount(), beforeStreamedLogin)
  const streamed = await streamedLogin(validBody)
  assert.equal(streamed.status, 200, await streamed.clone().text())
  assert.equal(await sessionCount(), beforeStreamedLogin + 1)
  const streamedCookie = streamed.headers
    .getSetCookie()
    .find((value) => /session_token=/.test(value))
  assert.ok(streamedCookie)
  assert.match(streamedCookie, /httponly/i)
  assert.match(streamedCookie, /samesite=lax/i)
  const streamedSession = await request('/api/auth/get-session', {
    cookie: streamedCookie.split(';')[0],
  })
  assert.equal(((await streamedSession.json()) as { user: { id: string } }).user.id, user.id)
  const nonBrowser = await streamedLogin(validBody, { origin: '' })
  assert.equal(nonBrowser.status, 200, await nonBrowser.clone().text())
  assert.equal(await sessionCount(), beforeStreamedLogin + 2)
  const adminCookie = await login(admin.email)
  const cookie = await login(user.email)
  const second = await login(user.email)
  const keyResponse = await request('/api/auth/api-key/create', {
    method: 'POST',
    cookie,
    body: { name: 'CRM', metadata: { scope: 'global' }, expiresIn: 86400 * 30 },
  })
  assert.equal(keyResponse.status, 200, await keyResponse.clone().text())
  const firstKey = (await keyResponse.json()) as { id: string; key: string; expiresAt: string }
  assert.match(firstKey.key, /^zappaz_/)
  assert.ok(new Date(firstKey.expiresAt).getTime() > Date.now() + 29 * 86400000)
  const secondResponse = await request('/api/auth/api-key/create', {
    method: 'POST',
    cookie,
    body: { name: 'ERP', metadata: { scope: 'global' }, expiresIn: null },
  })
  assert.equal(secondResponse.status, 200, await secondResponse.clone().text())
  const secondKey = (await secondResponse.json()) as { id: string; key: string }
  assert.notEqual(firstKey.key, secondKey.key)
  assert.equal(
    (await prisma.apikey.findUniqueOrThrow({ where: { id: secondKey.id } })).expiresAt,
    null,
  )
  assert.notEqual(
    (await prisma.apikey.findUniqueOrThrow({ where: { id: firstKey.id } })).key,
    firstKey.key,
  )
  const listKeys = await request('/api/auth/api-key/list', { cookie })
  const listedKeys = (await listKeys.json()) as {
    apiKeys: Record<string, unknown>[]
    total: number
  }
  assert.equal(listedKeys.total, 2)
  assert.ok(listedKeys.apiKeys.every((key) => !('key' in key)))
  assert.equal(
    (
      (await (await request('/api/auth/api-key/list', { cookie: adminCookie })).json()) as {
        total: number
      }
    ).total,
    0,
  )
  for (const [name, expiresIn] of [
    ['Short lived', 3600],
    ['No expiry', undefined],
  ] as const) {
    const response = await request('/api/auth/api-key/create', {
      method: 'POST',
      cookie,
      body: {
        name,
        metadata: { scope: 'global' },
        ...(expiresIn === undefined ? {} : { expiresIn }),
      },
    })
    assert.equal(response.status, 200, await response.clone().text())
    const created = (await response.json()) as { id: string; key: string; expiresAt: string | null }
    if (expiresIn === undefined) assert.equal(created.expiresAt, null)
    else {
      assert.ok(created.expiresAt)
      assert.ok(Math.abs(new Date(created.expiresAt).getTime() - Date.now() - 3600000) < 10000)
    }
    assert.equal(
      (await request('/test/user', { method: 'POST', apiKey: created.key, origin: '' })).status,
      200,
    )
    assert.equal(
      (
        await request('/api/auth/api-key/delete', {
          method: 'POST',
          cookie,
          body: { keyId: created.id },
        })
      ).status,
      200,
    )
  }
  for (const body of [
    { name: '', expiresIn: 86400 },
    { name: 'X', expiresIn: 0 },
    { name: 'X', expiresIn: 3599 },
    { name: 'X', expiresIn: 86400 * 366 },
    { name: 'X', expiresIn: 86400, userId: admin.id },
    { name: 'X', expiresIn: 86400, rateLimitEnabled: false },
  ]) {
    assert.equal(
      (await request('/api/auth/api-key/create', { method: 'POST', cookie, body })).status,
      400,
    )
  }
  assert.equal(
    (
      await request('/api/auth/api-key/create', {
        method: 'POST',
        body: { name: 'X', expiresIn: 86400 },
      })
    ).status,
    401,
  )
  assert.equal(
    (
      await request('/api/auth/api-key/create', {
        method: 'POST',
        cookie,
        origin: 'https://evil.test',
        body: { name: 'X', expiresIn: 86400 },
      })
    ).status,
    403,
  )
  assert.equal((await request('/api/auth/api-key/list', { apiKey: firstKey.key })).status, 403)
  assert.equal(
    (
      await request('/api/auth/api-key/delete', {
        method: 'POST',
        cookie: adminCookie,
        body: { keyId: firstKey.id },
      })
    ).status,
    404,
  )
  assert.equal(
    (await request('/test/user', { method: 'POST', apiKey: firstKey.key, origin: '' })).status,
    200,
  )
  assert.equal(
    (await prisma.apikey.findUniqueOrThrow({ where: { id: firstKey.id } })).requestCount,
    1,
  )
  assert.equal((await request('/test/user', { method: 'POST', cookie, origin: '' })).status, 403)
  assert.equal(
    (await request('/test/user', { method: 'POST', apiKey: 'invalid', cookie, origin: '' })).status,
    401,
  )
  assert.equal(
    (await request('/test/user', { method: 'POST', apiKey: '', cookie, origin: '' })).status,
    401,
  )
  assert.equal((await request('/test/admin', { apiKey: firstKey.key })).status, 403)
  const wa = await prisma.waSession.create({ data: { id: crypto.randomUUID(), userId: user.id } })
  const otherWa = await prisma.waSession.create({
    data: { id: crypto.randomUUID(), userId: other.id },
  })
  assert.equal(
    (await request(`/test/session/${wa.id}`, { method: 'POST', apiKey: firstKey.key, origin: '' }))
      .status,
    200,
  )
  assert.equal(
    (
      await request(`/test/session/${otherWa.id}`, {
        method: 'POST',
        apiKey: firstKey.key,
        origin: '',
      })
    ).status,
    401,
  )
  const mcp = await app.request('/test/mcp', {
    method: 'POST',
    headers: {
      'x-api-key': firstKey.key,
      'x-zappaz-preset': 'session',
      'x-zappaz-session-id': wa.id,
    },
  })
  assert.equal(mcp.status, 200)
  assert.equal(
    (
      await request(`/test/session/${wa.id}`, {
        method: 'POST',
        bearer: 'removed-session-jwt',
        origin: '',
      })
    ).status,
    401,
  )
  const scopedResponse = await request('/api/auth/api-key/create', {
    method: 'POST',
    cookie,
    body: { name: 'One session', metadata: { scope: 'session', sessionId: wa.id } },
  })
  assert.equal(scopedResponse.status, 200, await scopedResponse.clone().text())
  const scopedKey = (await scopedResponse.json()) as { id: string; key: string }
  assert.equal(
    (await request(`/test/session/${wa.id}`, { method: 'POST', apiKey: scopedKey.key, origin: '' }))
      .status,
    200,
  )
  const futureWa = await prisma.waSession.create({
    data: { id: crypto.randomUUID(), userId: user.id },
  })
  assert.equal(
    (
      await request(`/test/session/${futureWa.id}`, {
        method: 'POST',
        apiKey: scopedKey.key,
        origin: '',
      })
    ).status,
    401,
  )
  assert.equal(
    (
      await request(`/test/session/${futureWa.id}`, {
        method: 'POST',
        apiKey: firstKey.key,
        origin: '',
      })
    ).status,
    200,
  )
  assert.equal(
    (await request('/test/user', { method: 'POST', apiKey: scopedKey.key, origin: '' })).status,
    403,
  )
  assert.equal(
    (
      await request('/api/auth/api-key/create', {
        method: 'POST',
        cookie,
        body: { name: 'Unauthorized', metadata: { scope: 'session', sessionId: otherWa.id } },
      })
    ).status,
    403,
  )
  assert.equal(
    (
      await request('/api/auth/api-key/create', {
        method: 'POST',
        cookie,
        body: { name: 'No scope' },
      })
    ).status,
    400,
  )
  const { authenticateRealtime, authorizeSession } = await import(
    '../../server/src/middleware/auth.ts'
  )
  const scopedHeaders = new Headers({ 'x-api-key': scopedKey.key })
  assert.equal(await authenticateRealtime(scopedHeaders), true)
  assert.equal(await authorizeSession(scopedHeaders, wa), true)
  assert.equal(await authorizeSession(scopedHeaders, futureWa), false)
  const scopedMcp = (preset: string, sessionId?: string) =>
    app.request('/test/mcp', {
      method: 'POST',
      headers: {
        'x-api-key': scopedKey.key,
        'x-zappaz-preset': preset,
        ...(sessionId ? { 'x-zappaz-session-id': sessionId } : {}),
      },
    })
  assert.equal((await scopedMcp('user')).status, 403)
  assert.equal((await scopedMcp('session', wa.id)).status, 200)
  assert.equal((await scopedMcp('session', futureWa.id)).status, 401)
  const scopedList = await request('/api/v1/session', { apiKey: scopedKey.key })
  assert.equal(scopedList.status, 200)
  const scopedPage = (await scopedList.json()) as { data: { id: string }[]; total: number }
  assert.deepEqual(
    scopedPage.data.map((session) => session.id),
    [wa.id],
  )
  assert.equal(scopedPage.total, 1)
  const globalList = (await (
    await request('/api/v1/session', { apiKey: firstKey.key })
  ).json()) as { data: { id: string }[]; total: number }
  assert.equal(globalList.total, 2)
  assert.deepEqual(globalList.data.map((session) => session.id).sort(), [wa.id, futureWa.id].sort())
  assert.equal(
    (
      await request('/api/v1/session', {
        method: 'POST',
        apiKey: scopedKey.key,
        body: { config: {} },
      })
    ).status,
    403,
  )
  assert.equal(
    (await request(`/api/v1/session/${futureWa.id}`, { apiKey: scopedKey.key })).status,
    401,
  )
  await prisma.user.update({ where: { id: user.id }, data: { banned: true } })
  assert.equal(await authorizeSession(scopedHeaders, wa), false)
  await prisma.user.update({ where: { id: user.id }, data: { banned: false } })
  const adminScopedResponse = await request('/api/auth/api-key/create', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'Restricted admin', metadata: { scope: 'session', sessionId: otherWa.id } },
  })
  assert.equal(adminScopedResponse.status, 200, await adminScopedResponse.clone().text())
  const adminScoped = (await adminScopedResponse.json()) as { id: string; key: string }
  assert.equal(
    (await request(`/test/session/${otherWa.id}`, { method: 'POST', apiKey: adminScoped.key }))
      .status,
    200,
  )
  assert.equal(
    (await request(`/test/session/${wa.id}`, { method: 'POST', apiKey: adminScoped.key })).status,
    401,
  )
  assert.equal((await request('/test/admin', { apiKey: adminScoped.key })).status, 403)
  await prisma.apikey.delete({ where: { id: adminScoped.id } })
  assert.equal(
    await authorizeSession(new Headers({ 'x-api-key': adminScoped.key }), otherWa),
    false,
  )
  await prisma.apikey.update({ where: { id: scopedKey.id }, data: { permissions: null } })
  assert.equal(
    (await request(`/test/session/${wa.id}`, { method: 'POST', apiKey: scopedKey.key, origin: '' }))
      .status,
    401,
  )
  assert.equal(
    (await request('/test/user', { method: 'POST', bearer: 'removed-session-jwt', origin: '' }))
      .status,
    401,
  )
  // Native Better Auth account/security endpoints keep their real-login requirement.
  assert.equal((await request('/api/auth/admin/list-users', { apiKey: firstKey.key })).status, 403)
  const profileViaKey = await request('/api/auth/update-user', {
    method: 'POST',
    apiKey: firstKey.key,
    origin: '',
    body: { name: 'Integration' },
  })
  assert.equal(profileViaKey.status, 403, await profileViaKey.clone().text())
  assert.equal(
    (
      await request('/api/auth/change-password', {
        method: 'POST',
        apiKey: firstKey.key,
        body: { currentPassword: 'wrong', newPassword: 'updated-password-123' },
      })
    ).status,
    403,
  )
  await prisma.user.update({ where: { id: user.id }, data: { banned: true } })
  assert.equal(
    (
      await request(`/test/session/${wa.id}`, {
        method: 'POST',
        bearer: 'removed-session-jwt',
        origin: '',
      })
    ).status,
    401,
  )
  assert.equal((await request('/api/auth/get-session', { apiKey: firstKey.key })).status, 403)
  assert.equal((await request('/test/user', { method: 'POST', apiKey: firstKey.key })).status, 401)
  assert.equal(
    (
      await request('/api/auth/update-user', {
        method: 'POST',
        apiKey: firstKey.key,
        body: { name: 'Blocked' },
      })
    ).status,
    403,
  )
  await prisma.user.update({ where: { id: user.id }, data: { banned: false, role: 'ADMIN' } })
  assert.equal((await request('/test/admin', { apiKey: firstKey.key })).status, 200)
  assert.equal((await request('/api/auth/admin/list-users', { apiKey: firstKey.key })).status, 403)
  await prisma.user.update({ where: { id: user.id }, data: { role: 'USER' } })
  assert.equal((await request('/test/admin', { apiKey: firstKey.key })).status, 403)
  await prisma.apikey.update({ where: { id: secondKey.id }, data: { enabled: false } })
  assert.equal((await request('/test/user', { method: 'POST', apiKey: secondKey.key })).status, 401)
  await prisma.apikey.update({ where: { id: secondKey.id }, data: { enabled: true } })
  await prisma.apikey.update({
    where: { id: firstKey.id },
    data: { rateLimitMax: 1, requestCount: 1, lastRequest: new Date() },
  })
  assert.equal((await request('/test/user', { method: 'POST', apiKey: firstKey.key })).status, 429)
  await prisma.apikey.update({
    where: { id: firstKey.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  })
  assert.equal((await request('/test/user', { method: 'POST', apiKey: firstKey.key })).status, 401)
  assert.equal(
    (
      await request('/api/auth/api-key/delete', {
        method: 'POST',
        cookie,
        body: { keyId: secondKey.id },
      })
    ).status,
    200,
  )
  assert.equal((await request('/test/user', { method: 'POST', apiKey: secondKey.key })).status, 401)
  await prisma.waSession.deleteMany({ where: { id: { in: [wa.id, otherWa.id] } } })
  assert.equal(
    (
      (await (await request('/api/auth/get-session', { cookie })).json()) as {
        user: { id: string }
      }
    ).user.id,
    user.id,
  )
  assert.equal(
    (
      await request('/api/auth/sign-in/email', {
        method: 'POST',
        body: { email: user.email, password: 'wrong' },
      })
    ).status,
    401,
  )
  assert.equal(
    (await request('/api/auth/update-user', { method: 'POST', cookie, body: { role: 'ADMIN' } }))
      .status,
    400,
  )
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).role, 'USER')
  for (const body of [
    { email: 'attacker@example.test' },
    { name: 'Valid', role: 'ADMIN' },
    { phone: ' 5511999999999 ' },
    {},
  ]) {
    assert.equal(
      (await request('/api/auth/update-user', { method: 'POST', cookie, body })).status,
      400,
    )
  }
  for (const [path, body] of [
    ['/api/auth/admin/update-user', { userId: other.id, data: { name: 'Attack' } }],
    ['/api/auth/admin/set-role', { userId: user.id, role: 'ADMIN' }],
    ['/api/auth/admin/set-user-password', { userId: other.id, newPassword: 'attacker-password' }],
    ['/api/auth/admin/remove-user', { userId: other.id }],
  ] as const) {
    assert.equal((await request(path, { method: 'POST', cookie, body })).status, 403, path)
  }
  assert.equal((await request(`/api/auth/admin/get-user?id=${other.id}`, { cookie })).status, 404)
  assert.equal((await request('/api/auth/admin/list-users', { cookie })).status, 403)
  assert.equal(
    (
      await request('/api/auth/admin/create-user', {
        method: 'POST',
        cookie,
        body: {
          email: 'blocked@example.test',
          password,
          name: 'Blocked',
          role: 'ADMIN',
          data: { lastName: 'Test', phone: '5511999999999' },
        },
      })
    ).status,
    403,
  )
  assert.equal((await request('/api/auth/admin/list-users', { cookie: adminCookie })).status, 200)
  const created = await request('/api/auth/admin/create-user', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      email: 'created@example.test',
      password,
      name: 'Created',
      role: 'USER',
      data: { lastName: 'Test', phone: '5511999999999' },
    },
  })
  assert.equal(created.status, 200, await created.clone().text())
  const createdId = ((await created.json()) as { user: { id: string; role: string } }).user.id
  const listCreated = await request('/api/auth/admin/list-users', { cookie: adminCookie })
  assert.equal(listCreated.status, 200)
  const listed = ((await listCreated.json()) as { users: { id: string; role: string }[] }).users
  assert.equal(listed.find((item) => item.id === createdId)?.role, 'USER')
  assert.equal(
    (await request(`/api/auth/admin/get-user?id=${createdId}`, { cookie: adminCookie })).status,
    404,
  )
  const updated = await request('/api/auth/admin/update-user', {
    method: 'POST',
    cookie: adminCookie,
    body: { userId: createdId, data: { name: 'Updated' } },
  })
  assert.equal(updated.status, 200, await updated.clone().text())
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: createdId } })).firstName,
    'Updated',
  )
  assert.equal(
    (await prisma.user.findUniqueOrThrow({ where: { id: createdId } })).phone,
    '5511999999999',
  )
  for (const phone of ['', '123', ' 5511999999999 ']) {
    const invalid = await request('/api/auth/admin/update-user', {
      method: 'POST',
      cookie: adminCookie,
      body: { userId: createdId, data: { phone } },
    })
    assert.equal(invalid.status, 400, `invalid phone ${JSON.stringify(phone)}`)
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: createdId } })).phone,
      '5511999999999',
    )
  }
  const cleared = await request('/api/auth/admin/update-user', {
    method: 'POST',
    cookie: adminCookie,
    body: { userId: createdId, data: { phone: null } },
  })
  assert.equal(cleared.status, 200, await cleared.clone().text())
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: createdId } })).phone, null)
  const withoutPhone = await request('/api/auth/admin/update-user', {
    method: 'POST',
    cookie: adminCookie,
    body: { userId: createdId, data: { name: 'No phone' } },
  })
  assert.equal(withoutPhone.status, 200, await withoutPhone.clone().text())
  const storedWithoutPhone = await prisma.user.findUniqueOrThrow({ where: { id: createdId } })
  assert.equal(storedWithoutPhone.firstName, 'No phone')
  assert.equal(storedWithoutPhone.phone, null)
  for (const [email, data] of [
    ['no-phone@example.test', { lastName: 'Test' }],
    ['null-phone@example.test', { lastName: 'Test', phone: null }],
  ] as const) {
    const response = await request('/api/auth/admin/create-user', {
      method: 'POST',
      cookie: adminCookie,
      body: { email, password, name: 'No phone', role: 'USER', data },
    })
    assert.equal(response.status, 200, await response.clone().text())
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { email } })).phone, null)
  }
  const invalidCreate = await request('/api/auth/admin/create-user', {
    method: 'POST',
    cookie: adminCookie,
    body: {
      email: 'invalid-phone@example.test',
      password,
      name: 'Invalid',
      role: 'USER',
      data: { lastName: 'Test', phone: '123' },
    },
  })
  assert.equal(invalidCreate.status, 400)
  assert.equal(
    await prisma.user.findUnique({ where: { email: 'invalid-phone@example.test' } }),
    null,
  )
  const promoted = await request('/api/auth/admin/set-role', {
    method: 'POST',
    cookie: adminCookie,
    body: { userId: createdId, role: 'ADMIN' },
  })
  assert.equal(promoted.status, 200, await promoted.clone().text())
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: createdId } })).role, 'ADMIN')
  const demoted = await request('/api/auth/admin/set-role', {
    method: 'POST',
    cookie: adminCookie,
    body: { userId: createdId, role: 'USER' },
  })
  assert.equal(demoted.status, 200, await demoted.clone().text())
  const reset = await request('/api/auth/admin/set-user-password', {
    method: 'POST',
    cookie: adminCookie,
    body: { userId: createdId, newPassword: 'reset-password-123' },
  })
  assert.equal(reset.status, 200, await reset.clone().text())
  const createdCookie = await login('created@example.test', 'reset-password-123')
  const ownedKey = await request('/api/auth/api-key/create', {
    method: 'POST',
    cookie: createdCookie,
    body: { name: 'Disposable owner', metadata: { scope: 'global' }, expiresIn: 86400 },
  })
  assert.equal(ownedKey.status, 200)
  assert.equal(await prisma.apikey.count({ where: { referenceId: createdId } }), 1)
  const removed = await request('/api/auth/admin/remove-user', {
    method: 'POST',
    cookie: adminCookie,
    body: { userId: createdId },
  })
  assert.equal(removed.status, 200, await removed.clone().text())
  assert.equal(await prisma.user.findUnique({ where: { id: createdId } }), null)
  assert.equal(await prisma.apikey.count({ where: { referenceId: createdId } }), 0)
  for (const [path, body] of [
    ['/api/auth/admin/set-role', { userId: admin.id, role: 'USER' }],
    ['/api/auth/admin/remove-user', { userId: admin.id }],
  ] as const) {
    const response = await request(path, { method: 'POST', cookie: adminCookie, body })
    assert.ok(response.status >= 400, `last administrator: ${path}`)
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role, 'ADMIN')
  }
  for (const [method, path] of [
    ['POST', '/api/auth/sign-up/email'],
    ['POST', '/api/auth/admin/ban-user'],
    ['POST', '/api/auth/admin/impersonate-user'],
    ['GET', '/api/auth/admin/list-user-sessions'],
    ['DELETE', '/api/auth/get-session'],
  ] as const) {
    assert.equal(
      (
        await request(path, {
          method,
          cookie: adminCookie,
          ...(method === 'POST' ? { body: {} } : {}),
        })
      ).status,
      404,
      `${method} ${path}`,
    )
  }
  assert.equal(
    (
      await request('/api/auth/change-password', {
        method: 'POST',
        cookie,
        body: {
          currentPassword: 'wrong',
          newPassword: 'updated-password-123',
          revokeOtherSessions: true,
        },
      })
    ).status,
    400,
  )
  assert.ok(await (await request('/api/auth/get-session', { cookie: second })).json())
  const integrationResponse = await request('/api/auth/api-key/create', {
    method: 'POST',
    cookie,
    body: { name: 'Password revocation', metadata: { scope: 'global' } },
  })
  assert.equal(integrationResponse.status, 200, await integrationResponse.clone().text())
  const integration = (await integrationResponse.json()) as { id: string; key: string }
  const changed = await request('/api/auth/change-password', {
    method: 'POST',
    cookie,
    body: {
      currentPassword: password,
      newPassword: 'updated-password-123',
      revokeOtherSessions: true,
    },
  })
  assert.equal(await prisma.apikey.findUnique({ where: { id: integration.id } }), null)
  assert.equal(
    (await request('/test/user', { method: 'POST', apiKey: integration.key })).status,
    401,
  )
  assert.equal(changed.status, 200, await changed.clone().text())
  assert.equal(await (await request('/api/auth/get-session', { cookie: second })).json(), null)
  const replacement = await login(user.email, 'updated-password-123')
  assert.equal(
    (await request('/api/auth/sign-out', { method: 'POST', cookie: replacement, body: {} })).status,
    200,
  )
  assert.equal(await (await request('/api/auth/get-session', { cookie: replacement })).json(), null)
  assert.equal(
    (
      await request('/admin/temp-token', {
        method: 'POST',
        cookie: adminCookie,
        body: { email: other.email },
      })
    ).status,
    404,
  )
  assert.equal(
    (await request('/api/auth/temp-login/verify', { method: 'POST', body: { token: 'removed' } }))
      .status,
    404,
  )
  // Competing demotions must never leave the installation without an administrator.
  const anotherAdmin = await createUser('admin2@example.test', 'ADMIN')
  const results = await Promise.allSettled([
    prisma.user.update({ where: { id: admin.id }, data: { role: 'USER' } }),
    prisma.user.update({ where: { id: anotherAdmin.id }, data: { role: 'USER' } }),
  ])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(await prisma.user.count({ where: { role: 'ADMIN', banned: false } }), 1)
  const freshCookie = await login(user.email, 'updated-password-123')
  const updatedProfile = await request('/api/auth/update-user', {
    method: 'POST',
    cookie: freshCookie,
    body: { name: ' Maria ', lastName: ' Silva ', phone: '5511999999999' },
  })
  assert.equal(updatedProfile.status, 200, await updatedProfile.clone().text())
  const storedProfile = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
  assert.equal(storedProfile.firstName, 'Maria')
  assert.equal(storedProfile.lastName, 'Silva')
  assert.equal(storedProfile.phone, '5511999999999')

  // Concurrent requests at the quota boundary must serialize in PostgreSQL.
  const { whatsappService } = await import('../../server/src/services/whatsapp.ts')
  const quotaUser = await createUser('quota@example.test', 'USER')
  await prisma.waSession.createMany({
    data: Array.from({ length: 19 }, (_, i) => ({ id: `quota-${i}`, userId: quotaUser.id })),
  })
  const sessionConfig = {
    rejectCalls: false,
    ignoreGroups: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    clientConnectionName: 'Test',
  }
  const attempts = await Promise.allSettled(
    ['quota-a', 'quota-b'].map((id) =>
      whatsappService.createSession({
        id,
        userId: quotaUser.id,
        displayName: 'Quota',
        enabled: false,
        sessionConfig,
      }),
    ),
  )
  assert.equal(attempts.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(await prisma.waSession.count({ where: { userId: quotaUser.id } }), 20)
  const winner = attempts.find((result) => result.status === 'fulfilled')
  assert.ok(winner?.status === 'fulfilled')
  const quotaSessionId = winner.value.storedSession.id
  await prisma.webhook.createMany({
    data: Array.from({ length: 19 }, (_, i) => ({
      waSessionId: quotaSessionId,
      url: 'https://example.com',
      events: {},
      headers: {},
      enabled: false,
      displayName: `Quota ${i}`,
    })),
  })
  const { createWebhook } = await import('../../server/src/modules/webhooks/service.ts')
  const webhookAttempts = await Promise.allSettled(
    [1, 2].map(() =>
      createWebhook(quotaSessionId, {
        url: 'https://example.com',
        events: {},
        headers: {},
        enabled: false,
      }),
    ),
  )
  assert.equal(webhookAttempts.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(await prisma.webhook.count({ where: { waSessionId: quotaSessionId } }), 20)
} finally {
  await prisma.$disconnect()
}
