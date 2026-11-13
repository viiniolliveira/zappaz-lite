import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

let avatar: string | null = 'https://example.test/old'
let lookup: unknown
const contact = {
  id: 'contact',
  jid: '222@lid',
  lid: '222@lid',
  phoneNumber: '111',
  avatarUrl: avatar,
  avatarCheckedAt: null,
  isSaved: true,
  email: null,
  annotations: null,
  localName: null,
  name: null,
  pushName: null,
}
const tx = {
  $executeRaw: async () => {},
  waContact: {
    findMany: async (query: unknown) => {
      lookup = query
      return [{ ...contact, avatarUrl: avatar }]
    },
    update: async ({ data }: { data: { avatarUrl?: string | null } }) => {
      if (data.avatarUrl !== undefined) avatar = data.avatarUrl
      return { ...contact, avatarUrl: avatar }
    },
  },
  waConversation: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
}
mock.module('@db/prisma', () => ({
  prisma: { $transaction: async (action: (value: typeof tx) => Promise<unknown>) => action(tx) },
}))
const { storeContacts } = await import('../../server/src/lib/chat-store.ts')
await storeContacts('session', [{ id: '111@s.whatsapp.net', lid: '222@lid', imgUrl: 'changed' }])
assert.equal(avatar, 'https://example.test/old')
assert.deepEqual((lookup as { where: { OR: unknown[] } }).where.OR, [
  { jid: { in: ['111@s.whatsapp.net', '222@lid'] } },
  { phoneNumber: '111' },
  { lid: '222@lid' },
])
await storeContacts('session', [
  { id: '222@lid', phoneNumber: '111@s.whatsapp.net', imgUrl: 'removed' },
])
assert.equal(avatar, null)
