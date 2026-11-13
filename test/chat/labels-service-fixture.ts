import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'

const sessionId = 'session-a'
const conversationId = '00000000-0000-4000-8000-000000000001'
const firstId = '00000000-0000-4000-8000-000000000002'
const secondId = '00000000-0000-4000-8000-000000000003'
type StoredLabel = {
  id: string
  sessionId: string
  name: string
  description: string
  color: string
}
const labels: StoredLabel[] = [firstId, secondId].map((id) => ({
  id,
  sessionId,
  name: id,
  description: '',
  color: '#14b8a6',
}))
let links: { sessionId: string; conversationId: string; labelId: string }[] = []
let revision = 1
let committed = false
let failUpdate = false
let isGroup = false
const events: unknown[] = []
const invalidations: unknown[] = []
const tx = {
  waConversationLabel: {
    findMany: async ({ where }: { where: { sessionId: string } }) =>
      labels.filter((label) => label.sessionId === where.sessionId),
    findFirst: async ({ where }: { where: { sessionId: string; id: string } }) =>
      labels.find((label) => label.sessionId === where.sessionId && label.id === where.id) ?? null,
    count: async ({ where }: { where: { sessionId: string; id: { in: string[] } } }) =>
      labels.filter(
        (label) => label.sessionId === where.sessionId && where.id.in.includes(label.id),
      ).length,
    create: async ({ data }: { data: Omit<StoredLabel, 'id'> }) => {
      const label = { id: 'new', ...data }
      labels.push(label)
      return label
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<StoredLabel> }) => {
      const label = labels.find((item) => item.id === where.id)
      assert.ok(label)
      Object.assign(label, data)
      return label
    },
    delete: async ({ where }: { where: { id: string } }) => {
      labels.splice(
        labels.findIndex((label) => label.id === where.id),
        1,
      )
      links = links.filter((link) => link.labelId !== where.id)
    },
  },
  waConversationLabelLink: {
    findMany: async ({ where }: { where: { sessionId: string; labelId: string } }) =>
      links.filter((link) => link.sessionId === where.sessionId && link.labelId === where.labelId),
    deleteMany: async ({ where }: { where: { sessionId: string; conversationId: string } }) => {
      links = links.filter(
        (link) =>
          link.sessionId !== where.sessionId || link.conversationId !== where.conversationId,
      )
    },
    createMany: async ({ data }: { data: typeof links }) => {
      links.push(...data)
    },
  },
  waConversation: {
    findFirst: async ({ where }: { where: { sessionId: string; id: string; isGroup: boolean } }) =>
      where.sessionId === sessionId && where.id === conversationId && where.isGroup === isGroup
        ? { id: conversationId }
        : null,
    update: async () => {
      if (failUpdate) throw new Error('Database failed')
      revision++
    },
    updateMany: async ({ where }: { where: { sessionId: string; id: { in: string[] } } }) => {
      assert.equal(where.sessionId, sessionId)
      if (where.id.in.includes(conversationId)) revision++
    },
  },
}
mock.module('../../server/src/db/prisma.ts', () => ({
  prisma: { ...tx, waSession: { findUniqueOrThrow: async () => ({ userId: 'owner' }) } },
}))
mock.module('../../server/src/lib/chat-store.ts', () => ({
  chatTransaction: async (
    _sessionId: string,
    run: (transaction: typeof tx) => Promise<unknown>,
  ) => {
    const previousLinks = links.map((link) => ({ ...link }))
    committed = false
    try {
      const result = await run(tx)
      committed = true
      return result
    } catch (error) {
      links = previousLinks
      throw error
    }
  },
}))
mock.module('../../server/src/lib/chat-events.ts', () => ({
  publishChatChange: (event: unknown) => {
    assert.equal(committed, true)
    events.push(event)
  },
}))
mock.module('../../server/src/lib/app-events.ts', () => ({
  publishAppInvalidation: (event: unknown) => {
    assert.equal(committed, true)
    invalidations.push(event)
  },
}))
mock.module('../../server/src/modules/conversations/service.ts', () => ({
  getConversation: async () => ({
    id: conversationId,
    sessionId,
    labelIds: links.map((link) => link.labelId),
    revision,
  }),
}))

const service = await import('../../server/src/modules/conversation-labels/service.ts')
assert.equal((await service.listLabels(sessionId)).length, 2)
assert.equal((await service.listLabels('foreign')).length, 0)
const updated = await service.setConversationLabels(sessionId, conversationId, [firstId, secondId])
assert.deepEqual(updated.labelIds, [firstId, secondId])
assert.equal(updated.revision, 2)
await service.setConversationLabels(sessionId, conversationId, [secondId])
assert.deepEqual(
  links.map((link) => link.labelId),
  [secondId],
)
for (const [session, conversation, ids] of [
  ['foreign', conversationId, [firstId]],
  [sessionId, 'missing', [firstId]],
  [sessionId, conversationId, ['missing']],
] as const)
  await assert.rejects(
    () => service.setConversationLabels(session, conversation, [...ids]),
    /não encontrad/i,
  )
isGroup = true
await assert.rejects(
  () => service.setConversationLabels(sessionId, conversationId, [firstId]),
  /não encontrada/,
)
isGroup = false
const eventCount = events.length
failUpdate = true
await assert.rejects(
  () => service.setConversationLabels(sessionId, conversationId, []),
  /Database failed/,
)
assert.equal(events.length, eventCount)
assert.deepEqual(
  links.map((link) => link.labelId),
  [secondId],
)
failUpdate = false
await service.setConversationLabels(sessionId, conversationId, [])
assert.deepEqual(links, [])
await service.setConversationLabels(sessionId, conversationId, [firstId])
await service.saveLabel(
  sessionId,
  { name: 'Importante', description: 'Prioridade', color: '#ec4899' },
  firstId,
)
assert.equal(labels[0].name, 'Importante')
await assert.rejects(
  () => service.saveLabel('foreign', { name: 'Outro', description: '', color: '#14b8a6' }, firstId),
  /não encontrada/,
)
await assert.rejects(() => service.deleteLabel('foreign', firstId), /não encontrada/)
await service.deleteLabel(sessionId, firstId)
assert.deepEqual(links, [])
assert.equal(labels.length, 1)
assert.ok(invalidations.every((event) => JSON.stringify(event).includes('conversation-labels')))
assert.deepEqual(events.at(-1), { sessionId, conversationId })
assert.equal(
  await service
    .saveLabel(sessionId, { name: 'Novo', description: '', color: '#14b8a6' })
    .then((label) => label.name),
  'Novo',
)
