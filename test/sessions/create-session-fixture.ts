import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import type { SessionUser } from '../../server/src/modules/sessions/types.ts'

const createdSessions: { enabled: boolean; userId: string }[] = []
let readyChecks = 0

mock.module('@db/prisma', () => ({ prisma: {} }))
mock.module('@lib/utils', () => ({
  waitUntil: async ({ condition }: { condition: () => boolean }) => {
    assert.equal(condition(), true)
    readyChecks++
  },
}))
mock.module('@services/whatsapp', () => ({
  whatsappService: {
    createSession: async (data: { id: string; enabled: boolean; userId: string }) => {
      createdSessions.push(data)
      return {
        session: { enabled: data.enabled, status: 'close', qrCodeBase64: 'test-qr' },
        storedSession: { ...data, config: {} },
      }
    },
  },
}))

const { createSession } = await import('../../server/src/modules/sessions/service.ts')
const { CreateSessionBodySchema } = await import('../../server/src/modules/sessions/schema.ts')
const { UnauthorizedError } = await import('../../server/src/common/errors/unauthorized-error.ts')
const { ForbiddenError } = await import('../../server/src/common/errors/forbidden-error.ts')

for (const role of ['USER', 'ADMIN'] as const) {
  const user: SessionUser = {
    id: `test-${role}`,
    role,
    email: `${role.toLowerCase()}@example.com`,
    emailVerified: false,
    firstName: 'Test',
    lastName: 'User',
    phone: null,
    image: null,
    banned: false,
    banReason: null,
    banExpires: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  for (const enabled of [undefined, true, false]) {
    const data = CreateSessionBodySchema.parse({ displayName: 'Test', config: {}, enabled })
    if (role === 'USER' && enabled === false) {
      const countBefore = createdSessions.length
      await assert.rejects(createSession(user, data), ForbiddenError)
      assert.equal(createdSessions.length, countBefore)
      continue
    }
    const checksBefore = readyChecks
    const session = await createSession(user, data)
    assert.equal(session.enabled, enabled ?? true, `${role}: enabled=${enabled}`)
    assert.equal(session.userId, user.id)
    assert.equal(createdSessions.at(-1)?.enabled, enabled ?? true)
    assert.equal(readyChecks - checksBefore, data.enabled ? 1 : 0)
    if (data.enabled) assert.equal(session.qrCodeBase64, 'test-qr')
  }
}

const countBefore = createdSessions.length
await assert.rejects(
  createSession(null, CreateSessionBodySchema.parse({ config: {} })),
  UnauthorizedError,
)
assert.equal(createdSessions.length, countBefore)
