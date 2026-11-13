import { strict as assert } from 'node:assert'
import { randomUUID } from 'node:crypto'
import { validateChatTestDatabaseUrl } from './chat-test-database.ts'

assert.ok(process.env.CHAT_TEST_DATABASE_URL)
assert.equal(process.env.DATABASE_URL, process.env.CHAT_TEST_DATABASE_URL)
validateChatTestDatabaseUrl(process.env.CHAT_TEST_DATABASE_URL)
const { prisma } = await import('../../server/src/db/prisma.ts')
const { storeChatMessage, storeContacts, storeChatSummaries, findLegacyMessage, updateChatMessage, storeChatReaction, deleteChatMessages } = await import('../../server/src/lib/chat-store.ts')
const { deleteConversation, createConversation } = await import('../../server/src/modules/conversations/service.ts')
const { onChatChange } = await import('../../server/src/lib/chat-events.ts')
const session = randomUUID(), other = randomUUID()
const pn = '15551234567@s.whatsapp.net', lid = '987654321@lid'
const message = (id: string, remoteJid: string, remoteJidAlt?: string, addressingMode?: 'pn' | 'lid') => ({
  key: { id, remoteJid, remoteJidAlt, addressingMode, fromMe: false },
  messageTimestamp: 1700000000, message: { conversation: id },
})
try {
  await prisma.waSession.createMany({ data: [{ id: session }, { id: other }] })
  switch (process.argv[2]) {
    case 'duplicate-alias': {
      const changes: Array<{ sessionId: string; conversationId?: string; contactId?: string; messageId?: string; source?: string }> = []
      const unsubscribe = onChatChange(async change => { changes.push(change) })
      try {
        const saved = await storeChatMessage(session, message('duplicate', lid))
        assert.ok(saved)
        const before = await prisma.waConversation.findUniqueOrThrow({ where: { id: saved.conversationId }, include: { contact: true } })
        assert.ok(before.contact)
        assert.equal(before.contact.phoneNumber, null)
        assert.equal(before.unreadCount, 1)
        changes.length = 0
        const duplicate = await storeChatMessage(session, message('duplicate', lid, pn, 'lid'))
        assert.equal(duplicate?.id, saved.id)
        assert.equal(duplicate?.conversationId, saved.conversationId)
        const after = await prisma.waConversation.findUniqueOrThrow({ where: { id: saved.conversationId }, include: { contact: true } })
        assert.ok(after.contact)
        assert.equal(after.contact.id, before.contact.id)
        assert.equal(after.contact.phoneNumber, '15551234567')
        assert.equal(after.contact.lid, lid)
        assert.equal(after.unreadCount, before.unreadCount)
        assert.ok(after.contact.revision > before.contact.revision)
        assert.ok(after.revision > before.revision)
        assert.equal(await prisma.waMessage.count({ where: { sessionId: session } }), 1)
        assert.deepEqual(changes, [{ sessionId: session, conversationId: saved.conversationId, contactId: before.contact.id }])
      } finally {
        unsubscribe()
      }
      break
    }
    case 'modes': {
      for (const [s, primary, alternate, mode] of [[session, '987654321:2@lid', '15551234567:3@s.whatsapp.net', 'lid'], [other, '15551234567:3@s.whatsapp.net', '987654321:2@lid', 'pn']] as const) {
        const saved = await storeChatMessage(s, message('first', primary, alternate, mode))
        assert.ok(saved)
        const conversation = await prisma.waConversation.findUniqueOrThrow({ where: { id: saved.conversationId }, include: { contact: true } })
        assert.equal(conversation.contact?.phoneNumber, '15551234567')
        assert.equal(conversation.contact?.lid, lid)
        const duplicate = await storeChatMessage(s, message('first', alternate))
        assert.equal(duplicate?.id, saved.id)
        const second = await storeChatMessage(s, message('second', alternate))
        assert.equal(second?.conversationId, conversation.id)
        assert.equal(await prisma.waConversation.count({ where: { sessionId: s } }), 1)
        assert.equal(await prisma.waContact.count({ where: { sessionId: s } }), 1)
        assert.equal((await prisma.waConversation.findUniqueOrThrow({ where: { id: conversation.id } })).jid, conversation.jid)
      }
      break
    }
    case 'contacts': {
      await storeContacts(session, [{ id: lid, name: 'Same name' }])
      const before = await prisma.waContact.findFirstOrThrow({ where: { sessionId: session } })
      assert.equal(before.phoneNumber, null)
      assert.equal(before.lid, lid)
      await storeContacts(session, [{ id: lid, lid, phoneNumber: pn, notify: 'nickname' }])
      await storeContacts(session, [{ id: pn, name: 'Updated' }])
      const after = await prisma.waContact.findFirstOrThrow({ where: { sessionId: session } })
      assert.equal(after.id, before.id)
      assert.equal(after.jid, before.jid)
      assert.equal(after.phoneNumber, '15551234567')
      assert.equal(after.lid, lid)
      assert.equal(after.pushName, 'nickname')
      await storeContacts(session, [{ id: '111@s.whatsapp.net', name: 'Updated' }])
      assert.equal(await prisma.waContact.count({ where: { sessionId: session } }), 2)
      await storeContacts(other, [{ id: pn, lid, phoneNumber: pn }])
      assert.equal(await prisma.waContact.count({ where: { sessionId: other } }), 1)
      break
    }
    case 'group': {
      await storeChatMessage(session, { ...message('group', '123@g.us', pn, 'pn'), key: { ...message('group', '123@g.us', pn, 'pn').key, participant: lid, participantAlt: pn } })
      assert.equal(await prisma.waContact.count({ where: { sessionId: session } }), 0)
      const saved = await storeChatMessage(session, message('private', lid))
      assert.ok(saved)
      const contact = await prisma.waContact.findFirstOrThrow({ where: { sessionId: session } })
      assert.equal(contact.lid, lid)
      assert.equal(contact.phoneNumber, null)
      break
    }
    case 'lookup': {
      const saved = await storeChatMessage(session, message('target', pn, lid, 'pn'))
      assert.ok(saved)
      assert.equal((await findLegacyMessage(session, 'target', lid))?.id, saved.id)
      await updateChatMessage(session, { id: 'target', remoteJid: lid }, { message: { conversation: 'edited' } })
      assert.equal((await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })).text, 'edited')
      await storeChatReaction(session, { id: 'target', remoteJid: lid }, { senderJid: lid, fromMe: false, emoji: '👍', timestamp: '2023-11-14T22:13:21.000Z' })
      const reacted = await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })
      assert.equal((reacted.content as { reactions: Array<{ emoji: string }> }).reactions[0].emoji, '👍')
      await deleteChatMessages(session, lid)
      assert.ok((await prisma.waMessage.findUniqueOrThrow({ where: { id: saved.id } })).deletedAt)
      break
    }
    case 'deletion': {
      const saved = await storeChatMessage(session, message('before', pn, lid, 'pn'))
      assert.ok(saved)
      await deleteConversation(session, saved.conversationId)
      await storeChatSummaries(session, [{ id: lid }])
      assert.equal(await storeChatMessage(session, message('old', lid), 'history'), null)
      assert.equal(await prisma.waConversation.count({ where: { sessionId: session } }), 0)
      break
    }
    case 'conflict': {
      const first = await storeChatMessage(session, message('pn-message', pn))
      const second = await storeChatMessage(session, message('lid-message', lid))
      assert.ok(first && second)
      assert.notEqual(first.conversationId, second.conversationId)
      assert.deepEqual(await storeContacts(session, [{ id: lid, lid, phoneNumber: pn }]), { processed: 0, conflicts: 1 })
      assert.equal(await prisma.waConversation.count({ where: { sessionId: session } }), 2)
      assert.equal(await prisma.waMessage.count({ where: { sessionId: session } }), 2)
      assert.ok(await prisma.waMessage.findUnique({ where: { id: first.id } }))
      assert.ok(await prisma.waMessage.findUnique({ where: { id: second.id } }))
      break
    }
    case 'conflicting-phone': {
      const saved = await storeChatMessage(session, message('before', pn, lid, 'pn'))
      assert.ok(saved)
      const before = await prisma.waContact.findFirstOrThrow({ where: { sessionId: session } })
      assert.deepEqual(await storeContacts(session, [{ id: lid, lid, phoneNumber: '15550000000@s.whatsapp.net', name: 'should not persist' }]), { processed: 0, conflicts: 1 })
      const after = await prisma.waContact.findFirstOrThrow({ where: { sessionId: session } })
      assert.equal(after.id, before.id)
      assert.equal(after.phoneNumber, before.phoneNumber)
      assert.equal(after.lid, before.lid)
      assert.equal(after.name, before.name)
      assert.equal(await prisma.waContact.count({ where: { sessionId: session } }), 1)
      assert.equal(await prisma.waConversation.count({ where: { sessionId: session } }), 1)
      assert.ok(await prisma.waMessage.findUnique({ where: { id: saved.id } }))
      break
    }
    case 'mixed-conflicts': {
      const first = await storeChatMessage(session, message('pn-history', pn))
      const second = await storeChatMessage(session, message('lid-history', lid))
      assert.ok(first && second)
      const before = await prisma.waContact.findMany({ where: { sessionId: session }, orderBy: { jid: 'asc' } })
      const result = await storeContacts(session, [
        { id: lid, lid, phoneNumber: pn },
        { id: '111@s.whatsapp.net', name: 'healthy' },
        { id: '123@lid', lid: '456@lid' },
        { id: '222@s.whatsapp.net', name: 'last' },
        { id: lid, lid, phoneNumber: pn },
      ])
      assert.deepEqual(result, { processed: 2, conflicts: 3 })
      for (const contact of before) {
        const after = await prisma.waContact.findUniqueOrThrow({ where: { id: contact.id } })
        assert.equal(after.jid, contact.jid)
        assert.equal(after.phoneNumber, contact.phoneNumber)
        assert.equal(after.lid, contact.lid)
      }
      assert.equal(await prisma.waContact.count({ where: { sessionId: session } }), 4)
      assert.equal(await prisma.waConversation.count({ where: { sessionId: session } }), 2)
      assert.ok(await prisma.waMessage.findUnique({ where: { id: first.id } }))
      assert.ok(await prisma.waMessage.findUnique({ where: { id: second.id } }))
      break
    }
    case 'late-association': {
      const saved = await storeChatMessage(session, message('before', pn))
      assert.ok(saved)
      await deleteConversation(session, saved.conversationId)
      await storeContacts(session, [{ id: pn, lid, phoneNumber: pn }])
      const live = await storeChatMessage(session, { ...message('new', lid), messageTimestamp: Math.floor(Date.now() / 1000) }, 'live')
      assert.ok(live)
      assert.notEqual(live.conversationId, saved.conversationId)
      for (const alias of [pn, lid]) {
        assert.equal(await storeChatMessage(session, message(`old-${alias}`, alias), 'history'), null)
      }
      assert.deepEqual((await prisma.waMessage.findMany({ where: { sessionId: session } })).map(row => row.messageId), ['new'])
      break
    }
    case 'create-after-association': {
      const saved = await storeChatMessage(session, message('first', pn))
      assert.ok(saved)
      await storeContacts(session, [{ id: lid, lid, phoneNumber: pn }])
      const conversation = await prisma.waConversation.findUniqueOrThrow({ where: { id: saved.conversationId } })
      assert.ok(conversation.contactId)
      const result = await createConversation(session, { contactId: conversation.contactId })
      assert.equal(result.created, false)
      assert.equal(result.data.id, saved.conversationId)
      assert.equal(await prisma.waConversation.count({ where: { sessionId: session } }), 1)
      break
    }
    case 'create-by-phone': {
      const first = await createConversation(session, { phoneNumber: '15551234567' })
      assert.equal(first.created, true)
      const identity = await prisma.waContact.findFirstOrThrow({ where: { sessionId: session, phoneNumber: '15551234567' } })
      assert.equal(identity.isSaved, false)
      const second = await createConversation(session, { phoneNumber: '15551234567' })
      assert.equal(second.created, false)
      assert.equal(second.data.id, first.data.id)
      assert.equal(await prisma.waContact.count({ where: { sessionId: session } }), 1)
      assert.equal(await prisma.waConversation.count({ where: { sessionId: session } }), 1)
      assert.equal((await prisma.waContact.findUniqueOrThrow({ where: { id: identity.id } })).isSaved, false)
      break
    }
    case 'consolidate': {
      await storeContacts(session, [{ id: lid, name: 'LID name' }])
      const saved = await storeChatMessage(session, message('pn-message', pn))
      assert.ok(saved)
      const before = await prisma.waConversation.findUniqueOrThrow({ where: { id: saved.conversationId } })
      await storeContacts(session, [{ id: lid, lid, phoneNumber: pn }])
      const after = await prisma.waConversation.findUniqueOrThrow({ where: { id: saved.conversationId }, include: { contact: true } })
      assert.equal(after.contactId, before.contactId)
      assert.equal(after.contact?.lid, lid)
      assert.equal(after.contact?.phoneNumber, '15551234567')
      assert.equal(await prisma.waContact.count({ where: { sessionId: session } }), 1)
      assert.equal((await storeChatMessage(session, message('next', lid)))?.conversationId, saved.conversationId)
      break
    }
    default: throw new Error('Unknown case')
  }
} finally {
  await prisma.waConversationDeletion.deleteMany({ where: { sessionId: { in: [session, other] } } })
  await prisma.waSession.deleteMany({ where: { id: { in: [session, other] } } })
  await prisma.$disconnect()
}
