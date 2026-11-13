import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Client } from 'pg'
import { config } from '../../server/src/config.ts'
import { prisma } from '../../server/src/db/prisma.ts'
import { auth } from '../../server/src/lib/auth.ts'
import { hashPassword } from 'better-auth/crypto'
import createApp from '../../server/src/create-app.ts'
import { errorHandler } from '../../server/src/common/http/error-handler.ts'
import conversationsRouter from '../../server/src/modules/conversations/route.ts'
import { withConversationMediaLock } from '../../server/src/lib/chat-media-lock.ts'
import { storeChatMessage, storeChatSummaries } from '../../server/src/lib/chat-store.ts'
import { retryConversationMediaCleanup } from '../../server/src/lib/conversation-media-cleanup.ts'
import { deleteConversation } from '../../server/src/modules/conversations/service.ts'

const session = randomUUID(), other = randomUUID(), conversation = randomUUID(), otherConversation = randomUUID(), group = randomUUID(), contact = randomUUID(), message = randomUUID(), media = randomUUID()
const jid = '15551234567@s.whatsapp.net'
const dir = await mkdtemp('/tmp/opencode/conversation-deletion-')
config.mediaStorage.path = dir
const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  const ownerId = randomUUID()
  const password = 'deletion-test-password'
  const owner = await prisma.user.create({ data: { id: ownerId, email: `${ownerId}@example.test`, firstName: 'Test', lastName: 'Owner', accounts: { create: { accountId: ownerId, providerId: 'credential', password: await hashPassword(password) } } } })
  const login = await auth.api.signInEmail({ body: { email: owner.email, password }, asResponse: true })
  const cookie = login.headers.getSetCookie().find(value => value.includes('session_token='))?.split(';')[0]
  assert.ok(cookie)
  await client.query(`INSERT INTO "WaSession" ("id", "userId", "updatedAt") VALUES ($1,$3,NOW()),($2,$3,NOW())`, [session, other, owner.id])
  const keys = new Map<string, string>()
  for (const id of [session, other]) {
    const key = await auth.api.createApiKey({ headers: new Headers({ cookie }), body: { name: 'Deletion test', metadata: { scope: 'session', sessionId: id } } })
    keys.set(id, key.key)
  }
  await client.query(`INSERT INTO "WaContact" ("id", "sessionId", "jid", "updatedAt") VALUES ($1,$2,$3,NOW())`, [contact, session, jid])
  await client.query(`INSERT INTO "WaConversation" ("id", "sessionId", "jid", "contactId", "isGroup", "updatedAt") VALUES ($1,$4,$6,$7,false,NOW()),($2,$5,$6,NULL,false,NOW()),($3,$4,'123@g.us',NULL,true,NOW())`, [conversation, otherConversation, group, session, other, jid, contact])
  await client.query(`INSERT INTO "WaMessage" ("id", "sessionId", "conversationId", "messageId", "rawContent", "content", "orderAt", "updatedAt") VALUES ($1,$2,$3,'old','{}','{}',NOW(),NOW())`, [message, session, conversation])
  await client.query(`INSERT INTO "WaMessageMedia" ("id", "sessionId", "conversationId", "messageId", "kind", "thumbnailBase64", "storage", "key", "updatedAt") VALUES ($1,$2,$3,$4,'image','thumbnail','local',$5,NOW())`, [media, session, conversation, message, `${session}/${conversation}/old`])
  await mkdir(join(dir, session, conversation), { recursive: true })
  await mkdir(join(dir, other, otherConversation), { recursive: true })
  await writeFile(join(dir, session, conversation, 'old'), 'old file')
  await writeFile(join(dir, other, otherConversation, 'keep'), 'keep')
  const app = createApp()
  app.onError(errorHandler)
  app.route('/', conversationsRouter)
  const path = (sessionId: string, id: string) => `/api/v1/session/${sessionId}/conversations/${id}`
  const authorized = (sessionId: string) => ({ method: 'DELETE', headers: { 'x-api-key': keys.get(sessionId)! } })
  const unauthorized = await app.request(path(session, conversation), { method: 'DELETE' })
  assert.equal(unauthorized.status, 401)
  assert.equal((await unauthorized.json()).error.code, 'UNAUTHORIZED')
  assert.ok(await prisma.waConversation.findUnique({ where: { id: conversation } }))
  const wrongToken = await app.request(path(session, conversation), authorized(other))
  assert.equal(wrongToken.status, 401)
  assert.equal((await wrongToken.json()).error.code, 'UNAUTHORIZED')
  const wrongSession = await app.request(path(other, conversation), authorized(other))
  assert.equal(wrongSession.status, 404)
  assert.equal((await wrongSession.json()).error.code, 'NOT_FOUND')
  const groupResponse = await app.request(path(session, group), authorized(session))
  assert.equal(groupResponse.status, 404)
  const expected = { status: 'success', data: { conversationId: conversation, mediaCleanup: 'complete' } }
  const deleted = await app.request(path(session, conversation), authorized(session))
  assert.equal(deleted.status, 200)
  assert.deepEqual(await deleted.json(), expected)
  const retry = await app.request(path(session, conversation), authorized(session))
  assert.equal(retry.status, 200)
  assert.deepEqual(await retry.json(), expected)
  assert.equal(await prisma.waConversation.findUnique({ where: { id: conversation } }), null)
  assert.equal(await prisma.waMessage.findUnique({ where: { id: message } }), null)
  assert.equal(await prisma.waMessageMedia.findUnique({ where: { id: media } }), null)
  assert.ok(await prisma.waContact.findUnique({ where: { id: contact } }))
  assert.ok(await prisma.waConversation.findUnique({ where: { id: otherConversation } }))
  assert.ok(await prisma.waConversation.findUnique({ where: { id: group } }))
  await assert.rejects(() => readFile(join(dir, session, conversation, 'old')), { code: 'ENOENT' })
  assert.equal(await readFile(join(dir, other, otherConversation, 'keep'), 'utf8'), 'keep')
  const receipt = await prisma.waConversationDeletion.findUniqueOrThrow({ where: { conversationId: conversation } })
  assert.ok(receipt.filesDeletedAt)
  await storeChatSummaries(session, [{ id: jid, name: 'stale' }])
  const old = { key: { remoteJid: jid, id: 'history-old' }, messageTimestamp: 1735689600, message: { conversation: 'old' } }
  assert.equal(await storeChatMessage(session, old, 'history'), null)
  assert.equal(await prisma.waConversation.findUnique({ where: { sessionId_jid: { sessionId: session, jid } } }), null)
  await storeChatMessage(session, { key: { remoteJid: jid, id: 'live-new' }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: 'new' } }, 'live')
  const recreated = await prisma.waConversation.findUniqueOrThrow({ where: { sessionId_jid: { sessionId: session, jid } } })
  assert.notEqual(recreated.id, conversation)
  assert.equal(await storeChatMessage(session, old, 'history'), null)
  assert.deepEqual((await prisma.waMessage.findMany({ where: { conversationId: recreated.id } })).map(row => row.messageId), ['live-new'])
  // A pruned media row must not leave its previously persisted file behind.
  const orphanConversation = randomUUID()
  await client.query(`INSERT INTO "WaConversation" ("id", "sessionId", "jid", "isGroup", "updatedAt") VALUES ($1,$2,'777@s.whatsapp.net',false,NOW())`, [orphanConversation, session])
  await mkdir(join(dir, session, orphanConversation), { recursive: true })
  await writeFile(join(dir, session, orphanConversation, 'orphan'), 'orphan')
  assert.deepEqual(await deleteConversation(session, orphanConversation), { conversationId: orphanConversation, mediaCleanup: 'complete' })
  await assert.rejects(() => readFile(join(dir, session, orphanConversation, 'orphan')), { code: 'ENOENT' })
  assert.deepEqual((await prisma.waConversationDeletion.findUniqueOrThrow({ where: { conversationId: orphanConversation } })).storages, ['local'])
  // A slow file operation serializes deletion for that conversation, but not ingestion.
  const lockedConversation = randomUUID()
  await client.query(`INSERT INTO "WaConversation" ("id", "sessionId", "jid", "isGroup", "updatedAt") VALUES ($1,$2,'999@s.whatsapp.net',false,NOW())`, [lockedConversation, session])
  let release!: () => void
  let locked!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const lockAcquired = new Promise<void>(resolve => { locked = resolve })
  const fileOperation = withConversationMediaLock(session, lockedConversation, async () => { locked(); await gate })
  await lockAcquired
  let deletionFinished = false
  const deleting = deleteConversation(session, lockedConversation).then(result => { deletionFinished = true; return result })
  try {
    await Promise.race([
      storeChatMessage(session, { key: { remoteJid: '888@s.whatsapp.net', id: 'parallel-live' }, messageTimestamp: Math.floor(Date.now() / 1000), message: { conversation: 'independent' } }, 'live'),
      Bun.sleep(3000).then(() => { throw new Error('Ingestion blocked by unrelated media operation') }),
    ])
    assert.equal(deletionFinished, false)
    assert.ok(await prisma.waConversation.findUnique({ where: { id: lockedConversation } }))
  } finally {
    release()
    await fileOperation
  }
  assert.equal((await deleting).mediaCleanup, 'complete')
  assert.equal(await prisma.waConversation.findUnique({ where: { id: lockedConversation } }), null)
  // A durable failed job remains pending and is retried after configuration is repaired.
  const failed = randomUUID()
  await prisma.waConversationDeletion.create({ data: { conversationId: failed, sessionId: session, jid: 'pending@s.whatsapp.net', historyBefore: new Date(), storages: ['s3'] } })
  await retryConversationMediaCleanup()
  assert.equal((await prisma.waConversationDeletion.findUniqueOrThrow({ where: { conversationId: failed } })).filesDeletedAt, null)
  await prisma.waConversationDeletion.update({ where: { conversationId: failed }, data: { storages: ['local'] } })
  await retryConversationMediaCleanup()
  assert.ok((await prisma.waConversationDeletion.findUniqueOrThrow({ where: { conversationId: failed } })).filesDeletedAt)
} finally {
  await client.query(`DELETE FROM "WaConversationDeletion" WHERE "sessionId" = ANY($1::text[])`, [[session, other]])
  await client.query(`DELETE FROM "WaSession" WHERE "id" = ANY($1::text[])`, [[session, other]])
  await client.end()
  await prisma.$disconnect()
  await rm(dir, { recursive: true, force: true })
}
