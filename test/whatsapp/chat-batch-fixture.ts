import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

interface Contact {
  id: string
  sessionId: string
  jid: string
  phoneNumber?: string | null
  lid?: string | null
  name?: string | null
  isSaved: boolean
  email: string | null
  annotations: string | null
  localName: string | null
  pushName: string | null
  avatarUrl: string | null
  avatarCheckedAt: Date | null
}
interface Conversation {
  id: string
  sessionId: string
  jid: string
  contactId: string
}
type ContactCondition = { jid?: { in: string[] }; phoneNumber?: string; lid?: string }
const sessionId = 'session'
const contacts: Contact[] = [
  {
    id: 'existing',
    sessionId,
    jid: '111@s.whatsapp.net',
    phoneNumber: '111',
    lid: '100@lid',
    name: 'preserved',
    isSaved: true,
    email: null,
    annotations: null,
    localName: null,
    pushName: null,
    avatarUrl: null,
    avatarCheckedAt: null,
  },
]
const conversations: Conversation[] = []
const lookups: string[] = []
const dbError = new Error('database unavailable')
let failJid: string | undefined

const tx = {
  $executeRaw: async () => 1,
  waContact: {
    findMany: async ({ where }: { where: { sessionId: string; OR: ContactCondition[] } }) => {
      const jid = where.OR.find((condition) => condition.jid)?.jid?.in[0]
      if (jid) lookups.push(jid)
      if (jid === failJid) throw dbError
      return contacts.filter(
        (contact) =>
          contact.sessionId === where.sessionId &&
          where.OR.some(
            (condition) =>
              (condition.jid?.in.includes(contact.jid) ?? false) ||
              (condition.phoneNumber !== undefined &&
                contact.phoneNumber === condition.phoneNumber) ||
              (condition.lid !== undefined && contact.lid === condition.lid),
          ),
      )
    },
    create: async ({ data }: { data: Partial<Contact> & Pick<Contact, 'jid' | 'sessionId'> }) => {
      const contact: Contact = {
        id: `contact-${data.jid}`,
        isSaved: false,
        email: null,
        annotations: null,
        localName: null,
        pushName: null,
        avatarUrl: null,
        avatarCheckedAt: null,
        ...data,
      }
      contacts.push(contact)
      return contact
    },
    update: async () => {
      throw new Error('unexpected contact update')
    },
    deleteMany: async () => {
      throw new Error('unexpected contact delete')
    },
  },
  waConversation: {
    findMany: async ({
      where,
    }: {
      where: {
        sessionId: string
        contactId?: string
        OR?: Array<{ contactId?: { in: string[] }; jid?: { in: string[] } }>
      }
    }) =>
      conversations.filter(
        (conversation) =>
          conversation.sessionId === where.sessionId &&
          (where.OR
            ? where.OR.some(
                (condition) =>
                  (condition.contactId?.in.includes(conversation.contactId) ?? false) ||
                  (condition.jid?.in.includes(conversation.jid) ?? false),
              )
            : conversation.contactId === where.contactId),
      ),
    updateMany: async () => ({ count: 0 }),
    upsert: async ({
      create,
    }: {
      create: { sessionId: string; jid: string; contactId: string }
    }) => {
      const conversation = { id: `conversation-${create.jid}`, ...create }
      conversations.push(conversation)
      return conversation
    },
  },
  waConversationDeletion: { findFirst: async () => null },
}
mock.module('@db/prisma', () => ({
  prisma: { $transaction: async (action: (client: typeof tx) => Promise<unknown>) => action(tx) },
}))
const { storeContacts, storeChatSummaries } = await import('../../server/src/lib/chat-store.ts')

const first = '222@s.whatsapp.net'
const last = '333@s.whatsapp.net'
const conflicting = '111@s.whatsapp.net'
const before = structuredClone(contacts[0])

switch (process.argv[2]) {
  case 'contacts': {
    const result = await storeContacts(sessionId, [
      { id: first },
      { id: conflicting, lid: '200@lid', name: 'must not persist' },
      { id: last },
    ])
    assert.deepEqual(result, { processed: 2, conflicts: 1 })
    assert.deepEqual(contacts[0], before)
    assert.deepEqual(
      contacts.map((contact) => contact.jid),
      [conflicting, first, last],
    )
    assert.deepEqual(lookups, [first, conflicting, last])
    break
  }
  case 'summaries': {
    conversations.push(
      { id: 'history-a', sessionId, jid: conflicting, contactId: 'existing' },
      { id: 'history-b', sessionId, jid: '100@lid', contactId: 'existing' },
    )
    const preserved = structuredClone(conversations)
    const result = await storeChatSummaries(sessionId, [
      { id: first },
      { id: conflicting },
      { id: last },
    ])
    assert.deepEqual(result, { processed: 2, conflicts: 1 })
    assert.deepEqual(contacts[0], before)
    assert.deepEqual(conversations.slice(0, 2), preserved)
    assert.deepEqual(
      conversations.slice(2).map((conversation) => conversation.jid),
      [first, last],
    )
    assert.deepEqual(lookups, [first, conflicting, last])
    break
  }
  case 'contacts-database':
  case 'summaries-database': {
    failJid = conflicting
    const items = [{ id: first }, { id: conflicting }, { id: last }]
    const operation = process.argv[2] === 'contacts-database' ? storeContacts : storeChatSummaries
    await assert.rejects(operation(sessionId, items), (error) => error === dbError)
    assert.deepEqual(lookups, [first, conflicting])
    assert.deepEqual(contacts[0], before)
    assert.equal(
      contacts.some((contact) => contact.jid === last),
      false,
    )
    break
  }
  default:
    throw new Error('unknown scenario')
}
