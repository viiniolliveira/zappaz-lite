import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const contacts = [
  { id: '1', lid: '100@lid', phoneNumber: null as string | null },
  { id: '2', lid: '200@lid', phoneNumber: null as string | null },
  { id: '3', lid: '300@lid', phoneNumber: null as string | null },
  { id: '4', lid: '400@lid', phoneNumber: null as string | null },
]
const changes: unknown[] = [],
  errors: unknown[] = []
mock.module('@db/prisma', () => ({
  prisma: {
    waContact: {
      findMany: async ({
        where,
      }: {
        where: { sessionId: string; id?: { gt: string }; lid: { in?: string[] } }
      }) => {
        assert.equal(where.sessionId, 'session')
        return contacts
          .filter(
            (c) =>
              c.phoneNumber === null &&
              (!where.id || c.id > where.id.gt) &&
              (!where.lid.in || where.lid.in.includes(c.lid)),
          )
          .slice(0, 2)
      },
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; phoneNumber: null }
        data: { phoneNumber: string }
      }) => {
        assert.equal(where.phoneNumber, null)
        assert.deepEqual(Object.keys(data).sort(), ['phoneNumber', 'revision'])
        if (where.id === '2') throw new Error('unique constraint')
        const contact = contacts.find((c) => c.id === where.id)
        assert.ok(contact)
        contact.phoneNumber = data.phoneNumber
        return { count: 1 }
      },
    },
    waConversation: {
      updateMany: async ({ data }: { data: unknown }) => {
        assert.deepEqual(data, { revision: { increment: 1 } })
        return { count: 1 }
      },
      findMany: async () => [{ id: 'conversation' }],
    },
  },
}))
mock.module('../../server/src/lib/chat-events.ts', () => ({
  publishChatChange: (change: unknown) => changes.push(change),
}))
mock.module('../../server/src/lib/logger.ts', () => ({
  logger: { error: (error: unknown) => errors.push(error) },
}))
const { enrichContactPhones } = await import('../../server/src/lib/chat-contact-enrichment.ts')
const lookups: string[] = []
await enrichContactPhones('session', async (lid) => {
  lookups.push(lid)
  if (lid === '100@lid') return null
  if (lid === '300@lid') throw new Error('lookup failed')
  return '5511999999999:0@s.whatsapp.net'
})
assert.deepEqual(lookups, ['100@lid', '200@lid', '300@lid', '400@lid'])
assert.deepEqual(
  contacts.map((c) => c.phoneNumber),
  [null, null, null, '5511999999999'],
)
assert.equal(errors.length, 2)
assert.deepEqual(changes, [
  { sessionId: 'session', contactId: '4' },
  { sessionId: 'session', conversationId: 'conversation' },
])
const targeted: string[] = []
await enrichContactPhones(
  'session',
  async (lid) => {
    targeted.push(lid)
    return '5511888888888@s.whatsapp.net'
  },
  ['100@lid'],
)
assert.deepEqual(targeted, ['100@lid'])
assert.equal(contacts[0].phoneNumber, '5511888888888')
