import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { prisma } from '../../server/src/db/prisma.ts'
import { deleteLabel, saveLabel, setConversationLabels } from '../../server/src/modules/conversation-labels/service.ts'
import { ensureChatContact } from '../../server/src/lib/chat-identity.ts'
import { getMessageById, getMessages } from '../../server/src/modules/whatsapp-messages/query-service.ts'
import {
  deleteContact,
  listContacts,
  saveContact,
  saveExistingContact,
  updateContact,
} from '../../server/src/modules/contacts/service.ts'
import {
  getChatMessage,
  listMedia,
  listMessages,
} from '../../server/src/modules/conversation-messages/service.ts'
import {
  getConversation,
  listConversations,
  readConversation,
  setConversationReadState,
} from '../../server/src/modules/conversations/service.ts'

const session = randomUUID(),
  otherSession = randomUUID()
const conversation = randomUUID(),
  otherConversation = randomUUID(),
  sameSessionConversation = randomUUID(),
  group = randomUUID()
const ids = [randomUUID(), randomUUID(), randomUUID(), randomUUID()].sort()
const contacts = [randomUUID(), randomUUID()]
const client = new Client({ connectionString: process.env.DATABASE_URL })
await client.connect()
try {
  await client.query(
    `INSERT INTO "WaSession" ("id", "updatedAt") VALUES ($1,NOW()),($2,NOW())`,
    [session, otherSession],
  )
  await client.query(
    `INSERT INTO "WaContact" ("id", "sessionId", "jid", "name", "isSaved", "updatedAt") VALUES ($1,$3,$1,'Same',true,NOW()),($2,$3,$2,'Same',true,NOW())`,
    [...contacts, session],
  )
  await client.query(
    `INSERT INTO "WaConversation" ("id", "sessionId", "jid", "isGroup", "updatedAt") VALUES ($1,$4,$1,false,NOW()),($2,$5,$2,false,NOW()),($3,$4,$3,true,NOW()),($6,$4,$6,false,NOW())`,
    [conversation, otherConversation, group, session, otherSession, sameSessionConversation],
  )
  for (const id of ids)
    await client.query(
      `INSERT INTO "WaMessage" ("id", "sessionId", "conversationId", "messageId", "rawContent", "content", "orderAt", "updatedAt") VALUES ($1,$2,$3,$1,'{}','{"liveReceived":true}','2025-01-01T00:00:00Z',NOW())`,
      [id, session, conversation],
    )
  const first = await listMessages(session, conversation, { limit: 2 })
  assert.deepEqual(
    first.data.map((item) => item.id),
    ids.slice(2),
  )
  assert.equal(first.page.hasMore, true)
  const older = await listMessages(session, conversation, {
    limit: 2,
    before: first.page.nextCursor!,
  })
  assert.deepEqual(
    older.data.map((item) => item.id),
    ids.slice(0, 2),
  )
  const newer = await listMessages(session, conversation, {
    limit: 2,
    after: older.boundaries.last!,
  })
  assert.deepEqual(
    newer.data.map((item) => item.id),
    ids.slice(2),
  )
  assert.equal(newer.page.hasMore, false)
  await assert.rejects(
    () =>
      listMessages(otherSession, otherConversation, { limit: 2, before: first.page.nextCursor! }),
    /Invalid pagination cursor/,
  )
  await assert.rejects(() => getConversation(session, group), /not found/i)
  await assert.rejects(() => getConversation(otherSession, conversation), /not found/i)
  await assert.rejects(() => getChatMessage(otherSession, otherConversation, ids[0]!), /not found/i)
  await assert.rejects(
    () => getChatMessage(session, sameSessionConversation, ids[0]!),
    /not found/i,
  )
  await assert.rejects(
    () => readConversation(session, sameSessionConversation, ids[0]!),
    /not found/i,
  )
  await assert.rejects(() => readConversation(session, group, ids[0]!), /not found/i)
  await assert.rejects(
    () => readConversation(otherSession, otherConversation, ids[0]!),
    /not found/i,
  )
  const conversations = await listConversations(session, { limit: 50, q: '' })
  assert.deepEqual(
    conversations.data.map((item) => item.id),
    [conversation],
  )
  assert.equal((await getConversation(session, sameSessionConversation)).lastMessage, null)
  assert.equal(
    (await listConversations(session, { limit: 1, q: sameSessionConversation })).data.length,
    0,
  )
  const unknownId = randomUUID(),
    deletedId = randomUUID(),
    deletedConversation = randomUUID()
  await client.query(
    `INSERT INTO "WaConversation" ("id", "sessionId", "jid", "isGroup", "updatedAt") VALUES ($1,$2,$1,false,NOW())`,
    [deletedConversation, session],
  )
  await client.query(
    `INSERT INTO "WaMessage" ("id", "sessionId", "conversationId", "messageId", "type", "rawContent", "content", "orderAt", "deletedAt", "updatedAt") VALUES ($1,$3,$4,$1,'unknown','{}','{}',NOW(),NULL,NOW()),($2,$3,$5,$2,'text','{}','{}',NOW(),NOW(),NOW())`,
    [unknownId, deletedId, session, sameSessionConversation, deletedConversation],
  )
  const seen: string[] = []
  let cursor: string | undefined
  do {
    const result = await listConversations(session, { limit: 1, q: '', cursor })
    seen.push(...result.data.map((item) => item.id))
    cursor = result.page.nextCursor ?? undefined
  } while (cursor)
  assert.deepEqual(seen.sort(), [conversation, sameSessionConversation, deletedConversation].sort())
  assert.deepEqual(
    (await listConversations(session, { limit: 1, q: sameSessionConversation })).data.map(
      (item) => item.id,
    ),
    [sameSessionConversation],
  )
  const page = await listContacts(session, { limit: 1, q: 'Same' })
  assert.equal(page.data.length, 1)
  const next = await listContacts(session, { limit: 1, q: 'Same', cursor: page.page.nextCursor! })
  assert.deepEqual([page.data[0]!.id, next.data[0]!.id], contacts.sort())
  await assert.rejects(
    () => listContacts(session, { limit: 1, q: 'different', cursor: page.page.nextCursor! }),
    /Invalid pagination cursor/,
  )
  const phone = '5511888887777'
  const internal = await prisma.$transaction((tx) =>
    ensureChatContact(tx, session, `${phone}@s.whatsapp.net`, {
      name: 'WhatsApp name',
      pushName: 'Push name',
    }),
  )
  assert.equal(internal.contact.isSaved, false)
  assert.equal(internal.contact.localName, null)
  assert.equal((await listContacts(session, { limit: 50, q: phone })).data.length, 0)
  const linkedConversation = randomUUID()
  const linkedMessage = randomUUID()
  await client.query(
    `INSERT INTO "WaConversation" ("id", "sessionId", "jid", "contactId", "isGroup", "updatedAt") VALUES ($1,$2,$3,$4,false,NOW())`,
    [linkedConversation, session, `${phone}@s.whatsapp.net`, internal.contact.id],
  )
  await client.query(
    `INSERT INTO "WaMessage" ("id", "sessionId", "conversationId", "messageId", "rawContent", "content", "orderAt", "updatedAt") VALUES ($1,$2,$3,$1,'{}','{}',NOW(),NOW())`,
    [linkedMessage, session, linkedConversation],
  )
  const mediaId = randomUUID()
  await client.query(
    `INSERT INTO "WaMessageMedia" ("id", "sessionId", "conversationId", "messageId", "kind", "thumbnailBase64", "thumbnailMimeType", "storage", "key", "updatedAt") VALUES ($1,$2,$3,$4,'image','preview','image/jpeg','s3','test-key',NOW())`,
    [mediaId, session, linkedConversation, linkedMessage],
  )
  const galleryIds: string[] = [mediaId]
  for (const kind of ['video', 'document', 'audio', 'sticker', 'image'] as const) {
    const messageId = randomUUID(),
      itemId = randomUUID()
    await client.query(
      `INSERT INTO "WaMessage" ("id", "sessionId", "conversationId", "messageId", "rawContent", "content", "orderAt", "deletedAt", "updatedAt") VALUES ($1,$2,$3,$1,'{}','{}',NOW(),$4,NOW())`,
      [messageId, session, linkedConversation, kind === 'image' ? new Date() : null],
    )
    await client.query(
      `INSERT INTO "WaMessageMedia" ("id", "sessionId", "conversationId", "messageId", "kind", "updatedAt") VALUES ($1,$2,$3,$4,$5,NOW())`,
      [itemId, session, linkedConversation, messageId, kind],
    )
    if (kind === 'video' || kind === 'document' || kind === 'audio') galleryIds.push(itemId)
  }
  const gallery = await listMedia(session, linkedConversation, { limit: 50, kind: 'gallery' })
  assert.deepEqual(gallery.data.map((item) => item.id).sort(), galleryIds.sort())
  assert.equal(gallery.count, 4)
  assert.equal(gallery.data.find((item) => item.id === mediaId)?.message.id, linkedMessage)
  const firstGallery = await listMedia(session, linkedConversation, { limit: 1, kind: 'gallery' })
  assert.equal(firstGallery.page.hasMore, true)
  const restGallery = await listMedia(session, linkedConversation, {
    limit: 50,
    kind: 'gallery',
    cursor: firstGallery.page.nextCursor!,
  })
  assert.equal(firstGallery.count, 4)
  assert.equal(restGallery.count, 4)
  assert.deepEqual(
    [...firstGallery.data, ...restGallery.data].map((item) => item.id).sort(),
    galleryIds.sort(),
  )
  await assert.rejects(
    () =>
      listMedia(session, linkedConversation, {
        limit: 50,
        kind: 'image',
        cursor: firstGallery.page.nextCursor!,
      }),
    /Invalid pagination cursor/,
  )
  await assert.rejects(
    () => listMedia(otherSession, linkedConversation, { limit: 50, kind: 'gallery' }),
    /not found/i,
  )
  const paginatedConversation = randomUUID()
  await client.query(
    `INSERT INTO "WaConversation" ("id", "sessionId", "jid", "isGroup", "updatedAt") VALUES ($1,$2,$1,false,NOW())`,
    [paginatedConversation, session],
  )
  const expectedMedia = new Map<string, string>()
  for (let index = 0; index < 53; index++) {
    const messageId = randomUUID(),
      itemId = randomUUID()
    await client.query(
      `INSERT INTO "WaMessage" ("id", "sessionId", "conversationId", "messageId", "rawContent", "content", "orderAt", "updatedAt") VALUES ($1,$2,$3,$1,'{}','{}','2025-01-01T00:00:00Z',NOW())`,
      [messageId, session, paginatedConversation],
    )
    await client.query(
      `INSERT INTO "WaMessageMedia" ("id", "sessionId", "conversationId", "messageId", "kind", "createdAt", "updatedAt") VALUES ($1,$2,$3,$4,'image','2025-01-01T00:00:00Z',NOW())`,
      [itemId, session, paginatedConversation, messageId],
    )
    expectedMedia.set(itemId, messageId)
  }
  const allMedia: string[] = []
  let mediaCursor: string | undefined
  for (const [index, size] of [24, 24, 5].entries()) {
    const result = await listMedia(session, paginatedConversation, {
      limit: 24,
      kind: 'gallery',
      cursor: mediaCursor,
    })
    assert.equal(result.count, 53)
    assert.equal(result.data.length, size)
    assert.equal(result.page.hasMore, index < 2)
    assert.equal(result.page.nextCursor === null, index === 2)
    for (const item of result.data) {
      assert.equal(item.message.id, expectedMedia.get(item.id))
      assert.equal(item.message.conversationId, paginatedConversation)
      allMedia.push(item.id)
    }
    mediaCursor = result.page.nextCursor ?? undefined
  }
  assert.equal(new Set(allMedia).size, 53)
  assert.deepEqual(
    allMedia,
    [...expectedMedia.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([id]) => id),
  )
  assert.equal(
    (await listMedia(session, paginatedConversation, { limit: 24, kind: 'video' })).count,
    0,
  )
  await saveContact(session, {
    name: 'Agenda name',
    phoneNumber: phone,
    email: 'person@example.com',
    annotations: 'Initial notes',
  })
  let saved = await prisma.waContact.findUniqueOrThrow({ where: { id: internal.contact.id } })
  assert.equal(saved.isSaved, true)
  assert.equal(saved.localName, 'Agenda name')
  assert.equal(saved.email, 'person@example.com')
  assert.equal(saved.annotations, 'Initial notes')
  assert.equal(saved.name, 'WhatsApp name')
  assert.equal(saved.pushName, 'Push name')
  await prisma.$transaction((tx) =>
    ensureChatContact(tx, session, `${phone}@s.whatsapp.net`, {
      name: 'Updated upstream',
      pushName: 'Updated push',
    }),
  )
  saved = await prisma.waContact.findUniqueOrThrow({ where: { id: internal.contact.id } })
  assert.equal(saved.localName, 'Agenda name')
  assert.equal(saved.name, 'Updated upstream')
  assert.equal(saved.email, 'person@example.com')
  assert.equal(saved.annotations, 'Initial notes')
  assert.deepEqual(
    (await listContacts(session, { limit: 50, q: 'Agenda name' })).data.map((item) => item.id),
    [internal.contact.id],
  )
  await assert.rejects(
    () => saveContact(session, { name: 'Duplicate', phoneNumber: phone }),
    (error: unknown) => {
      assert.ok(error instanceof Error && 'status' in error && 'code' in error)
      assert.equal(error.status, 409)
      assert.equal(error.code, 'CONFLICT')
      return true
    },
  )
  await assert.rejects(() =>
    updateContact(otherSession, internal.contact.id, { name: 'Wrong session' }),
  )
  await assert.rejects(() => deleteContact(otherSession, internal.contact.id))
  await updateContact(session, internal.contact.id, { name: 'Renamed' })
  saved = await prisma.waContact.findUniqueOrThrow({ where: { id: internal.contact.id } })
  assert.equal(saved.email, 'person@example.com')
  assert.equal(saved.annotations, 'Initial notes')
  await updateContact(session, internal.contact.id, { name: 'Renamed', email: '', annotations: '' })
  saved = await prisma.waContact.findUniqueOrThrow({ where: { id: internal.contact.id } })
  assert.equal(saved.email, null)
  assert.equal(saved.annotations, null)
  await updateContact(session, internal.contact.id, {
    name: 'Renamed',
    email: 'new@example.com',
    annotations: 'Updated notes',
  })
  assert.equal(
    (await listContacts(session, { limit: 50, q: 'Renamed' })).data[0]?.displayName,
    'Renamed',
  )
  await deleteContact(session, internal.contact.id)
  saved = await prisma.waContact.findUniqueOrThrow({ where: { id: internal.contact.id } })
  assert.equal(saved.isSaved, false)
  assert.equal(saved.localName, null)
  assert.equal(saved.email, null)
  assert.equal(saved.annotations, null)
  assert.equal(saved.name, 'Updated upstream')
  assert.equal(saved.phoneNumber, phone)
  assert.equal((await listContacts(session, { limit: 50, q: phone })).data.length, 0)
  assert.equal(
    (await prisma.waConversation.findUniqueOrThrow({ where: { id: linkedConversation } }))
      .contactId,
    internal.contact.id,
  )
  assert.equal(
    (await prisma.waMessage.findUniqueOrThrow({ where: { id: linkedMessage } })).conversationId,
    linkedConversation,
  )
  const media = await prisma.waMessageMedia.findUniqueOrThrow({ where: { id: mediaId } })
  assert.equal(media.thumbnailBase64, 'preview')
  assert.equal(media.storage, 's3')
  assert.equal(media.key, 'test-key')
  await prisma.$transaction((tx) =>
    ensureChatContact(tx, session, `${phone}@s.whatsapp.net`, { name: 'Synced again' }),
  )
  saved = await prisma.waContact.findUniqueOrThrow({ where: { id: internal.contact.id } })
  assert.equal(saved.isSaved, false)
  assert.equal(saved.localName, null)
  await assert.rejects(() => updateContact(session, internal.contact.id, { name: 'Deleted' }))
  await assert.rejects(() => deleteContact(session, internal.contact.id))
  const lid = '123456789012345@lid'
  const lidContact = await prisma.$transaction((tx) => ensureChatContact(tx, session, lid))
  assert.equal(lidContact.contact.phoneNumber, null)
  await assert.rejects(() =>
    saveExistingContact(otherSession, lidContact.contact.id, { name: 'Wrong session' }),
  )
  await saveExistingContact(session, lidContact.contact.id, { name: 'LID contact' })
  const savedLid = await prisma.waContact.findUniqueOrThrow({
    where: { id: lidContact.contact.id },
  })
  assert.equal(savedLid.isSaved, true)
  assert.equal(savedLid.localName, 'LID contact')
  assert.equal(savedLid.phoneNumber, null)
  assert.equal(savedLid.lid, lid)
  const mergePhone = '5511777776666@s.whatsapp.net'
  const mergeLid = '987654321012345@lid'
  const pnIdentity = await prisma.$transaction((tx) => ensureChatContact(tx, session, mergePhone))
  const lidIdentity = await prisma.$transaction((tx) => ensureChatContact(tx, session, mergeLid))
  await prisma.waContact.update({
    where: { id: pnIdentity.contact.id },
    data: { createdAt: new Date('2020-01-01T00:00:00Z') },
  })
  await saveExistingContact(session, lidIdentity.contact.id, {
    name: 'Merged',
    email: 'merged@example.com',
    annotations: 'Merged notes',
  })
  const merged = await prisma.$transaction((tx) =>
    ensureChatContact(tx, session, mergePhone, {}, [mergeLid]),
  )
  assert.equal(merged.contact.id, pnIdentity.contact.id)
  assert.equal(merged.contact.isSaved, true)
  assert.equal(merged.contact.localName, 'Merged')
  assert.equal(merged.contact.email, 'merged@example.com')
  assert.equal(merged.contact.annotations, 'Merged notes')
  await readConversation(session, conversation, ids[2]!)
  await readConversation(session, conversation, ids[0]!)
  let state = await getConversation(session, conversation)
  assert.equal(state.lastReadMessageRecordId, ids[2])
  assert.equal(state.unreadCount, 1)
  await Promise.all([
    readConversation(session, conversation, ids[3]!),
    readConversation(session, conversation, ids[1]!),
  ])
  state = await getConversation(session, conversation)
  assert.equal(state.lastReadMessageRecordId, ids[3])
  assert.equal(state.unreadCount, 0)
  state = await setConversationReadState(session, conversation, false)
  assert.equal(state.unreadCount, 1)
  assert.equal(state.lastReadMessageRecordId, null)
  state = await setConversationReadState(session, conversation, false)
  assert.equal(state.unreadCount, 1)
  state = await readConversation(session, conversation, ids[3]!)
  assert.equal(state.unreadCount, 0)
  assert.equal(state.lastReadMessageRecordId, ids[3])
  await client.query(`UPDATE "WaConversation" SET "unreadCount" = 7 WHERE "id" = $1`, [
    conversation,
  ])
  state = await setConversationReadState(session, conversation, false)
  assert.equal(state.unreadCount, 7)
  state = await setConversationReadState(session, conversation, true)
  assert.equal(state.unreadCount, 0)
  assert.equal(state.lastReadMessageRecordId, ids[3])
  for (const read of [true, false]) {
    await assert.rejects(
      () => setConversationReadState(otherSession, conversation, read),
      /not found/i,
    )
    await assert.rejects(() => setConversationReadState(session, group, read), /not found/i)
  }
  const firstLabel = await saveLabel(session, { name: 'Importante', description: '', color: '#ec4899' })
  const secondLabel = await saveLabel(session, { name: 'Aguardando pagamento', description: 'Retornar', color: '#14b8a6' })
  const foreignLabel = await saveLabel(otherSession, { name: 'Outra sessão', description: '', color: '#3b82f6' })
  await assert.rejects(() => saveLabel(session, { name: 'Importante', description: '', color: '#ec4899' }), /unique/i)
  const labeled = await setConversationLabels(session, conversation, [firstLabel.id, secondLabel.id])
  assert.deepEqual(labeled.labelIds.toSorted(), [firstLabel.id, secondLabel.id].toSorted())
  const labelPage = await listConversations(session, { limit: 1, q: '', labelId: firstLabel.id })
  assert.deepEqual(labelPage.data.map((item) => item.id), [conversation])
  const foreignPage = await listConversations(otherSession, { limit: 10, q: '', labelId: firstLabel.id })
  assert.deepEqual(foreignPage.data, [])
  await assert.rejects(() => setConversationLabels(session, conversation, [foreignLabel.id]), /não encontrada/)
  await assert.rejects(() => setConversationLabels(otherSession, conversation, []), /não encontrada/)
  await assert.rejects(() => setConversationLabels(session, group, []), /não encontrada/)
  await deleteLabel(session, firstLabel.id)
  assert.deepEqual((await getConversation(session, conversation)).labelIds, [secondLabel.id])
  await prisma.waConversation.delete({ where: { id: conversation } })
  assert.equal(await prisma.waConversationLabelLink.count({ where: { sessionId: session, conversationId: conversation } }), 0)
  assert.ok(await prisma.waConversationLabel.findUnique({ where: { id: secondLabel.id } }))
  const identityConversation = await prisma.waConversation.create({ data: {
    sessionId: session, jid: mergePhone, contactId: merged.contact.id,
  } })
  const identityMessage = await prisma.waMessage.create({ data: {
    sessionId: session, conversationId: identityConversation.id, messageId: 'duplicate-wa-id',
    rawContent: {}, content: {},
  } })
  for (const [sid, cid] of [[session, sameSessionConversation], [otherSession, otherConversation], [session, group]]) {
    await prisma.waMessage.create({ data: {
      sessionId: sid!, conversationId: cid!, messageId: 'duplicate-wa-id', rawContent: {}, content: {},
    } })
  }
  for (const filters of [
    { conversationId: identityConversation.id },
    { phoneNumber: mergePhone.split('@')[0]! }, { lid: mergeLid }, { jid: mergePhone }, { jid: mergeLid },
    { conversationId: identityConversation.id, phoneNumber: mergePhone.split('@')[0]!, lid: mergeLid, jid: mergeLid },
  ]) {
    const resolved = await getMessageById(session, 'duplicate-wa-id', filters)
    assert.equal(resolved.id, identityMessage.id)
    const page = await getMessages(session, { limit: 1, ...filters })
    assert.deepEqual(page.data.map((message) => message.id), [identityMessage.id])
  }
  assert.deepEqual((await getMessages(session, { limit: 1, conversationId: group })).data, [])
  assert.deepEqual((await getMessages(otherSession, { limit: 1, conversationId: identityConversation.id })).data, [])
  for (const filters of [
    { conversationId: identityConversation.id, phoneNumber: '999999' },
    { conversationId: otherConversation }, { conversationId: group },
  ]) {
    await assert.rejects(() => getMessageById(session, 'duplicate-wa-id', filters), /not found/i)
  }
  const sessionPage = await getMessages(session, { limit: 1 })
  assert.equal(sessionPage.page.hasMore, true)
  const next = await getMessages(session, { limit: 1, before: sessionPage.page.nextCursor! })
  assert.notEqual(next.data[0]?.id, sessionPage.data[0]?.id)
  await assert.rejects(() => getMessages(session, {
    limit: 1, lid: mergeLid, before: sessionPage.page.nextCursor!,
  }), /Invalid pagination cursor/)
} finally {
  await client.query(`DELETE FROM "WaSession" WHERE "id" = ANY($1::text[])`, [
    [session, otherSession],
  ])
  await client.end()
  await prisma.$disconnect()
}
