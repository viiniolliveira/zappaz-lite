import { prisma } from '@db/prisma'
import { publishChatChange } from './chat-events.ts'
import { contactIdentifiers } from './chat-identity.ts'
import { logger } from './logger.ts'

/** One pass after history is persisted; never changes conversation or message identity. */
export async function enrichContactPhones(
  sessionId: string,
  lookup: (lid: string) => Promise<string | null>,
  lids?: string[],
) {
  let cursor: string | undefined
  for (;;) {
    const contacts = await prisma.waContact.findMany({
      where: {
        sessionId,
        phoneNumber: null,
        lid: lids ? { in: lids } : { not: null },
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: 'asc' },
      take: 100,
      select: { id: true, lid: true },
    })
    if (!contacts.length) return
    for (const contact of contacts) {
      cursor = contact.id
      if (!contact.lid) continue
      try {
        const pn = await lookup(contact.lid)
        if (!pn) continue
        const { phoneNumber } = contactIdentifiers([pn])
        if (!phoneNumber) throw new Error('Baileys returned an invalid phone-number JID')
        // Conditional write preserves a phone learned concurrently. The unique index
        // rejects ownership conflicts without merging or deleting either contact.
        const updated = await prisma.waContact.updateMany({
          where: { sessionId, id: contact.id, lid: contact.lid, phoneNumber: null },
          data: { phoneNumber, revision: { increment: 1 } },
        })
        if (!updated.count) continue
        publishChatChange({ sessionId, contactId: contact.id })
        await prisma.waConversation.updateMany({
          where: { sessionId, contactId: contact.id },
          data: { revision: { increment: 1 } },
        })
        const conversations = await prisma.waConversation.findMany({
          where: { sessionId, contactId: contact.id },
          select: { id: true },
        })
        for (const conversation of conversations)
          publishChatChange({ sessionId, conversationId: conversation.id })
      } catch (error) {
        logger.error({
          err: error,
          sessionId,
          contactId: contact.id,
          msg: 'Post-sync contact phone enrichment failed',
        })
      }
    }
  }
}
