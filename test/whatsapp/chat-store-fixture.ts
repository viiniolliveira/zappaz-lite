import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { validateChatTestDatabaseUrl } from './chat-test-database.ts'

assert.ok(process.env.CHAT_TEST_DATABASE_URL)
assert.equal(process.env.DATABASE_URL, process.env.CHAT_TEST_DATABASE_URL)
validateChatTestDatabaseUrl(process.env.CHAT_TEST_DATABASE_URL)
const { prisma } = await import('../../server/src/db/prisma.ts')
const { onChatChange } = await import('../../server/src/lib/chat-events.ts')
const { deleteChatMessages, storeChatMessage, storeChatReaction, storeChatSummaries, storeContacts, updateChatMessage } = await import('../../server/src/lib/chat-store.ts')
const first = randomUUID()
const second = randomUUID()
const changes: Array<{ sessionId: string; conversationId?: string; contactId?: string; messageId?: string; source?: string }> = []
const unsubscribe = onChatChange(async (change) => { changes.push(change) })
try {
  await prisma.waSession.createMany({ data: [{ id: first }, { id: second }] })
  const jpeg = await sharp({ create: { width: 9, height: 6, channels: 3, background: '#abc' } }).jpeg().toBuffer()
  const message = { key: { id: 'same-wa-id', remoteJid: '123@s.whatsapp.net', fromMe: false }, messageTimestamp: 1700000000, message: { imageMessage: { mimetype: 'image/jpeg', jpegThumbnail: jpeg } } }
  const saved = await storeChatMessage(first, message, 'live')
  assert.ok(saved)
  assert.notEqual(saved.id, message.key.id)
  assert.equal(saved.messageId, message.key.id)
  const duplicate = await storeChatMessage(first, message, 'live')
  assert.equal(duplicate?.id, saved.id)
  const conversation = await prisma.waConversation.findUniqueOrThrow({ where: { id: saved.conversationId } })
  assert.equal(conversation.unreadCount, 1)
  assert.equal(await prisma.waMessage.count({ where: { sessionId: first } }), 1)
  assert.equal(changes.filter((change) => change.sessionId === first && change.source === 'live').length, 1)
  const media = await prisma.waMessageMedia.findUniqueOrThrow({ where: { messageId: saved.id } })
  assert.equal(media.thumbnailBase64, jpeg.toString('base64'))
  assert.equal(media.thumbnailMimeType, 'image/jpeg')
  assert.equal(media.thumbnailWidth, 9)
  assert.equal(media.thumbnailHeight, 6)
  assert.equal(media.storage, null)
  assert.equal(media.key, null)
  assert.equal(media.storageStatus, 'not_saved')
  for (const kind of ['image', 'video'] as const) {
    const header = kind === 'image'
      ? { imageMessage: { mimetype: 'image/jpeg', jpegThumbnail: jpeg } }
      : { videoMessage: { mimetype: 'video/mp4', staticUrl: 'https://example.invalid/video', jpegThumbnail: jpeg } }
    const input = { key: { id: `interactive-${kind}`, remoteJid: 'interactive@g.us', fromMe: false }, messageTimestamp: 1700000000,
      message: { interactiveMessage: { header, body: { text: 'Legenda' } } } }
    const savedInteractive = await storeChatMessage(first, input, 'history')
    assert.ok(savedInteractive)
    const stored = await prisma.waMessage.findUniqueOrThrow({ where: { id: savedInteractive.id }, include: { media: true } })
    assert.equal(stored.type, kind)
    assert.equal(stored.text, 'Legenda')
    assert.equal(stored.media?.kind, kind)
    assert.equal(stored.media?.thumbnailBase64, jpeg.toString('base64'))
    assert.deepEqual(stored.rawContent, JSON.parse(JSON.stringify(input)))
  }
  const templateReply = { key: { id: 'template-reply', remoteJid: 'interactive@g.us', fromMe: false }, messageTimestamp: 1700000000,
    message: { templateButtonReplyMessage: { selectedDisplayText: 'Sim', selectedId: 'yes', selectedIndex: 0,
      contextInfo: { stanzaId: 'original', participant: 'bob@lid', quotedMessage: { templateMessage: { hydratedTemplate: { hydratedContentText: 'Confirma?' } } } } } } }
  const savedReply = await storeChatMessage(first, templateReply, 'history')
  assert.ok(savedReply)
  const storedReply = await prisma.waMessage.findUniqueOrThrow({ where: { id: savedReply.id } })
  assert.equal(storedReply.type, 'text')
  assert.equal(storedReply.text, 'Sim')
  assert.deepEqual((storedReply.content as { templateReply: unknown }).templateReply, { selectedId: 'yes', selectedIndex: 0 })
  assert.deepEqual((storedReply.content as { replyTo: unknown }).replyTo, { id: 'original', senderId: 'bob@lid', fromMe: null, type: 'text', text: 'Confirma?', interactive: { title: null, footer: null, buttons: [] } })
  assert.deepEqual(storedReply.rawContent, JSON.parse(JSON.stringify(templateReply)))
  await storeChatMessage(first, { ...message, key: { ...message.key, id: 'history' }, messageTimestamp: 1600000000 }, 'history')
  const afterHistory = await prisma.waConversation.findUniqueOrThrow({ where: { id: conversation.id } })
  assert.equal(afterHistory.unreadCount, 1)
  assert.equal(afterHistory.lastMessageId, saved.id)
  await updateChatMessage(first, message.key, { status: 4 })
  await updateChatMessage(first, message.key, { status: 2 })
  const updated = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
  assert.equal(updated.status, 4)
  assert.equal(updated.orderAt.toISOString(), saved.orderAt.toISOString())
  const otherSession = await storeChatMessage(second, message, 'live')
  const otherConversation = await storeChatMessage(first, { ...message, key: { ...message.key, remoteJid: '456@s.whatsapp.net' } }, 'live')
  assert.ok(otherSession && otherConversation)
  assert.notEqual(otherSession.id, saved.id)
  assert.notEqual(otherConversation.id, saved.id)
  assert.notEqual(otherConversation.conversationId, saved.conversationId)
  assert.equal(otherSession.messageId, saved.messageId)
  assert.equal(otherConversation.messageId, saved.messageId)

  // Chat summaries must create empty private conversations without creating bubbles.
  const beforeSummaryCount = await prisma.waMessage.count({ where: { sessionId: first } })
  await storeChatSummaries(first, [
    { id: '789@s.whatsapp.net', name: 'Summary contact' },
    { id: 'ignored@g.us', name: 'Group' },
    { id: null },
  ])
  const summary = await prisma.waConversation.findUniqueOrThrow({ where: { sessionId_jid: { sessionId: first, jid: '789@s.whatsapp.net' } }, include: { contact: true } })
  assert.equal(summary.contact?.name, 'Summary contact')
  assert.equal(summary.unreadCount, 0)
  assert.equal(summary.lastMessageId, null)
  assert.equal(await prisma.waMessage.count({ where: { sessionId: first } }), beforeSummaryCount)
  assert.equal(await prisma.waConversation.findUnique({ where: { sessionId_jid: { sessionId: first, jid: 'ignored@g.us' } } }), null)
  assert.ok(changes.some((change) => change.sessionId === first && change.conversationId === summary.id && change.contactId === summary.contactId))

  await prisma.waContact.update({ where: { id: summary.contact!.id }, data: { avatarUrl: 'https://example.test/avatar' } })
  const contactChangesStart = changes.length
  await storeContacts(first, [{ id: '789@s.whatsapp.net', name: 'Updated contact', notify: 'Nickname', imgUrl: 'changed' }])
  const afterContact = await prisma.waConversation.findUniqueOrThrow({ where: { id: summary.id }, include: { contact: true } })
  assert.equal(afterContact.contact?.name, 'Updated contact')
  assert.equal(afterContact.contact?.pushName, 'Nickname')
  assert.equal(afterContact.contact?.avatarUrl, 'https://example.test/avatar')
  await storeContacts(first, [{ id: '789@s.whatsapp.net', imgUrl: 'removed' }])
  const afterRemoval = await prisma.waContact.findUniqueOrThrow({ where: { id: summary.contact!.id } })
  assert.equal(afterRemoval.avatarUrl, null)
  assert.ok(afterContact.contact!.revision > summary.contact!.revision)
  assert.ok(afterContact.revision > summary.revision)
  assert.ok(changes.slice(contactChangesStart).some((change) => change.contactId === summary.contactId && change.sessionId === first))
  assert.ok(changes.slice(contactChangesStart).some((change) => change.conversationId === summary.id && change.sessionId === first))

  // Protocol and reaction envelopes affect the target, never create extra messages.
  const envelope = { key: { id: 'envelope', remoteJid: message.key.remoteJid, fromMe: false }, messageTimestamp: 1700000001 }
  const target = { id: message.key.id }
  const countBeforeProtocol = await prisma.waMessage.count({ where: { sessionId: first } })
  assert.equal(await storeChatMessage(first, { ...envelope, message: { protocolMessage: { key: target, type: 14, editedMessage: { conversation: 'edited text' } } } }), null)
  const edited = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
  assert.equal(edited.text, 'edited text')
  assert.ok(edited.editedAt)
  assert.equal(edited.orderAt.toISOString(), saved.orderAt.toISOString())
  assert.equal(await storeChatMessage(first, { ...envelope, message: { reactionMessage: { key: target, text: '👍' } } }), null)
  const reacted = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
  assert.deepEqual((reacted.content as { reactions: unknown[] }).reactions, [{ senderJid: message.key.remoteJid, fromMe: false, emoji: '👍', timestamp: '2023-11-14T22:13:21.000Z' }])
  const beforeEdit = reacted.content as { reactions: unknown[]; reactionVersions: Record<string, string>; liveReceived: boolean }
  await updateChatMessage(first, message.key, { message: { conversation: 'edited after reaction' } })
  const afterEdit = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
  const afterEditContent = afterEdit.content as typeof beforeEdit
  assert.equal(afterEdit.text, 'edited after reaction')
  assert.equal(afterEditContent.liveReceived, true)
  assert.deepEqual(afterEditContent.reactions, beforeEdit.reactions)
  assert.deepEqual(afterEditContent.reactionVersions, beforeEdit.reactionVersions)
  const sender = message.key.remoteJid
  assert.equal(afterEditContent.reactionVersions[sender], '2023-11-14T22:13:21.000Z')
  for (const timestamp of ['2023-11-14T22:13:20.000Z', '2023-11-14T22:13:21.000Z']) {
    await storeChatReaction(first, message.key, { senderJid: sender, fromMe: false, emoji: '👎', timestamp })
  }
  const afterStale = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
  assert.deepEqual(afterStale.content, afterEdit.content)
  assert.equal(afterStale.revision, afterEdit.revision)
  assert.equal(await storeChatMessage(first, { ...envelope, messageTimestamp: 1700000002, message: { reactionMessage: { key: target, text: '' } } }), null)
  const unreacted = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
  assert.deepEqual((unreacted.content as { reactions: unknown[] }).reactions, [])
  for (const timestamp of ['2023-11-14T22:13:21.000Z', '2023-11-14T22:13:22.000Z']) {
    await storeChatReaction(first, message.key, { senderJid: sender, fromMe: false, emoji: '👍', timestamp })
  }
  const stillRemoved = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
  assert.deepEqual(stillRemoved.content, unreacted.content)
  assert.equal(stillRemoved.revision, unreacted.revision)
  await storeChatReaction(first, message.key, { senderJid: sender, fromMe: false, emoji: '❤️', timestamp: '2023-11-14T22:13:23.000Z' })
  const readded = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
  assert.equal((readded.content as { reactions: Array<{ emoji: string }> }).reactions[0].emoji, '❤️')
  assert.equal(await storeChatMessage(first, { ...envelope, message: { protocolMessage: { key: target, type: 0 } } }), null)
  const revoked = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
  assert.ok(revoked.deletedAt)
  assert.equal(revoked.text, null)
  assert.equal(revoked.orderAt.toISOString(), saved.orderAt.toISOString())
  assert.equal(await storeChatMessage(first, { ...envelope, message: { protocolMessage: { key: { id: 'missing' }, type: 0 } } }), null)
  assert.equal(await prisma.waMessage.count({ where: { sessionId: first } }), countBeforeProtocol)
  assert.equal((await prisma.waConversation.findUniqueOrThrow({ where: { id: conversation.id } })).unreadCount, 1)
  assert.equal((await prisma.waMessage.findUniqueOrThrow({ where: { id: otherSession.id } })).deletedAt, null)
  assert.equal((await prisma.waMessage.findUniqueOrThrow({ where: { id: otherConversation.id } })).deletedAt, null)

  for (const [index, width, height, size, duration] of [
    [0, 0, -1, -1, -1],
    [1, 2147483648, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.MAX_SAFE_INTEGER + 1],
    [2, 1, 2147483647, 0, 0],
  ] as const) {
    const stored = await storeChatMessage(first, { key: { id: `metadata-${index}`, remoteJid: 'metadata@s.whatsapp.net', fromMe: true }, message: { videoMessage: { mimetype: 'video/mp4', width, height, fileLength: size, seconds: duration } } }, 'history')
    assert.ok(stored)
    const metadata = await prisma.waMessageMedia.findUniqueOrThrow({ where: { messageId: stored.id } })
    assert.equal(metadata.width, index === 2 ? width : null)
    assert.equal(metadata.height, index === 2 ? height : null)
    assert.equal(metadata.size, index === 2 ? size : null)
    assert.equal(metadata.duration, index === 2 ? duration : null)
  }

  const beforeDelete = changes.length
  await deleteChatMessages(first, message.key.remoteJid)
  const deletedConversation = await prisma.waConversation.findUniqueOrThrow({ where: { id: conversation.id } })
  assert.equal(deletedConversation.unreadCount, 0)
  const remaining = await prisma.waMessage.findMany({ where: { sessionId: first, conversationId: conversation.id } })
  assert.ok(remaining.every((item) => item.deletedAt && item.text === null))
  assert.ok(changes.slice(beforeDelete).some((change) => change.conversationId === conversation.id && change.source === 'update'))
  assert.equal((await prisma.waMessage.findUniqueOrThrow({ where: { id: otherSession.id } })).deletedAt, null)
  assert.equal((await prisma.waMessage.findUniqueOrThrow({ where: { id: otherConversation.id } })).deletedAt, null)
  await deleteChatMessages(first, 'missing@s.whatsapp.net')
} finally {
  unsubscribe()
  await prisma.waSession.deleteMany({ where: { id: { in: [first, second] } } })
  await prisma.$disconnect()
}
