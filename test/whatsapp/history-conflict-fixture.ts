import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { proto } from 'baileys'
import { AppError } from '../../server/src/common/errors/app-error.ts'
import { CreateSessionConfigSchema } from '../../server/src/common/schema.ts'
import {
  contactIdentifiers,
  isContactIdentityConflict,
} from '../../server/src/lib/chat-identity.ts'

const conflict = () => {
  try {
    contactIdentifiers(['1@lid', '2@lid'])
    throw new Error('expected identity conflict')
  } catch (error) {
    return error
  }
}
const databaseError = new Error('database unavailable')
const saved: string[] = []
const phases: string[] = []
const storedContacts: Array<{ id: string; phoneNumber?: string }> = []
const storedKeys: Array<{ id: string; remoteJidAlt?: string }> = []
const enriched: Array<{ lid: string; pn: string | null }> = []
mock.module('../../server/src/lib/chat-contact-enrichment.ts', () => ({
  enrichContactPhones: async (
    _session: string,
    lookup: (lid: string) => Promise<string | null>,
    lids: string[] = [],
  ) => {
    for (const lid of lids) enriched.push({ lid, pn: await lookup(lid) })
  },
}))
let failure: 'none' | 'contacts' | 'conversations' | 'messages' = 'none'

mock.module('@db/prisma', () => ({ prisma: { globalWebhook: { findMany: async () => [] } } }))
mock.module('../../server/src/lib/chat-store.ts', () => ({
  updateContactAvatar: async () => {
    throw new Error('unexpected contact avatar update')
  },
  chatTransaction: async () => {
    throw new Error('unexpected transaction')
  },
  storeContacts: async (_session: string, items: Array<{ id: string; phoneNumber?: string }>) => {
    storedContacts.push(...items)
    phases.push('contacts')
    if (failure === 'contacts') throw databaseError
    return {
      processed: items.filter((item) => item.id !== 'conflict').length,
      conflicts: items.filter((item) => item.id === 'conflict').length,
    }
  },
  storeChatSummaries: async (_session: string, items: Array<{ id: string }>) => {
    phases.push('conversations')
    if (failure === 'conversations') throw databaseError
    return {
      processed: items.filter((item) => item.id !== 'conflict').length,
      conflicts: items.filter((item) => item.id === 'conflict').length,
    }
  },
  storeChatMessage: async (
    _session: string,
    message: { key: { id: string; remoteJidAlt?: string } },
  ) => {
    storedKeys.push(message.key)
    const id = message.key.id
    if (id === 'conflict') throw conflict()
    if (failure === 'messages' && id === 'db-error') throw databaseError
    saved.push(id)
  },
  deleteChatMessages: async () => {},
  updateChatMessage: async () => {},
  storeChatReaction: async () => {},
  findLegacyMessage: async () => null,
}))

const { WhatsappSession } = await import('../../server/src/lib/whatsapp-session.ts')
const session = new WhatsappSession(
  'session',
  false,
  CreateSessionConfigSchema.parse({}),
  'test',
  null,
)
type Message = {
  key: { id: string; remoteJid: string; remoteJidAlt?: string; fromMe: boolean }
  message: { conversation: string }
  messageTimestamp: number
}
type Payload = {
  contacts: Array<{ id: string; phoneNumber?: string }>
  chats: Array<{ id: string }>
  messages: Message[]
  syncType: number
  progress: number
  lidPnMappings?: Array<{ lid: string; pn: string }>
}
const internal = session as unknown as {
  onMessagingHistorySet(payload: Payload): Promise<void>
  onMessagesUpsert(payload: { messages: Message[]; type: 'notify' }): Promise<void>
  forwardEvent(event: { event: string; payload: unknown }): void
  onLidMapping(mapping: { lid: string; pn: string }): Promise<void>
  client: { signalRepository: { lidMapping: { getPNForLID(lid: string): Promise<string | null> } } }
}
const events: string[] = []
internal.forwardEvent = (event) => {
  events.push(event.event)
}
const message = (id: string): Message => ({
  key: { id, remoteJid: '123@s.whatsapp.net', fromMe: false },
  message: { conversation: id },
  messageTimestamp: 1700000000,
})
const payload = (contacts: string[], chats: string[], messages: string[]): Payload => ({
  contacts: contacts.map((id) => ({ id })),
  chats: chats.map((id) => ({ id })),
  messages: messages.map(message),
  syncType: proto.HistorySync.HistorySyncType.FULL,
  progress: 100,
})

switch (process.argv[2]) {
  case 'mapping-without-contact': {
    const history = payload([], ['100@lid', '111@s.whatsapp.net'], ['one'])
    history.lidPnMappings = [{ lid: '100@lid', pn: '111@s.whatsapp.net' }]
    history.messages[0].key.remoteJid = '100@lid'
    await internal.onMessagingHistorySet(history)
    assert.deepEqual(phases, ['contacts', 'conversations'])
    assert.deepEqual(storedContacts, [{ id: '100@lid', phoneNumber: '111@s.whatsapp.net' }])
    assert.equal(storedKeys[0].remoteJidAlt, '111@s.whatsapp.net')
    break
  }
  case 'known-local-mapping': {
    internal.client = {
      signalRepository: { lidMapping: { getPNForLID: async () => '111@s.whatsapp.net' } },
    }
    const history = payload(['100@lid'], ['100@lid'], ['one'])
    history.messages[0].key.remoteJid = '100@lid'
    await internal.onMessagingHistorySet(history)
    assert.equal(storedContacts[0].phoneNumber, '111@s.whatsapp.net')
    assert.equal(storedKeys[0].remoteJidAlt, '111@s.whatsapp.net')
    break
  }
  case 'explicit-mappings': {
    const history = payload(['100@lid', '200@lid', '300@lid'], ['100@lid'], ['one', 'two', 'three'])
    history.lidPnMappings = [{ lid: '100@lid', pn: '111@s.whatsapp.net' }]
    history.contacts[1].phoneNumber = '222@s.whatsapp.net'
    history.messages.forEach((item, index) => {
      item.key.remoteJid = `${(index + 1) * 100}@lid`
    })
    history.messages[2].key.remoteJidAlt = '333@s.whatsapp.net'
    await internal.onMessagingHistorySet(history)
    assert.deepEqual(
      storedContacts.slice(0, 3).map((c) => c.phoneNumber),
      ['111@s.whatsapp.net', '222@s.whatsapp.net', '333@s.whatsapp.net'],
    )
    assert.deepEqual(
      storedKeys.map((key) => key.remoteJidAlt),
      ['111@s.whatsapp.net', '222@s.whatsapp.net', '333@s.whatsapp.net'],
    )
    assert.equal(enriched.length, 3)
    assert.equal(session.syncState.syncStatus, 'idle')
    break
  }
  case 'mapping-after-completion': {
    await internal.onMessagingHistorySet(payload([], [], []))
    await internal.onLidMapping({ lid: '100:2@lid', pn: '111:0@s.whatsapp.net' })
    assert.deepEqual(enriched, [{ lid: '100@lid', pn: '111@s.whatsapp.net' }])
    break
  }
  case 'lookup-failure': {
    internal.client = {
      signalRepository: {
        lidMapping: {
          getPNForLID: async () => {
            throw databaseError
          },
        },
      },
    }
    const history = payload(['100@lid'], ['100@lid'], ['first', 'last'])
    history.messages[0].key.remoteJid = '100@lid'
    await internal.onMessagingHistorySet(history)
    assert.deepEqual(saved, ['first', 'last'])
    assert.equal(session.syncState.syncStatus, 'idle')
    break
  }
  case 'classifier': {
    assert.equal(isContactIdentityConflict(conflict()), true)
    assert.equal(
      isContactIdentityConflict(
        new AppError({ code: 'CONFLICT', status: 409, message: 'other conflict' }),
      ),
      false,
    )
    assert.equal(
      isContactIdentityConflict({ code: 'CONTACT_IDENTITY_CONFLICT', status: 409 }),
      false,
    )
    assert.equal(isContactIdentityConflict(null), false)
    break
  }
  case 'history': {
    await internal.onMessagingHistorySet(
      payload(
        ['first', 'conflict', 'last'],
        ['conflict', 'chat'],
        ['conflict', 'ok1', 'conflict', 'ok2'],
      ),
    )
    assert.deepEqual(phases, ['contacts', 'conversations'])
    assert.deepEqual(saved, ['ok1', 'ok2'])
    const errorId = session.syncState.syncProgress?.errorId
    assert.match(
      errorId ?? '',
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
    assert.deepEqual(session.syncState, {
      syncStatus: 'error',
      syncProgress: { phase: 'error', contacts: 2, conversations: 1, messages: 2, errorId },
    })
    await internal.onMessagingHistorySet(payload(['later'], ['later'], ['later']))
    assert.deepEqual(saved, ['ok1', 'ok2', 'later'])
    assert.deepEqual(session.syncState, {
      syncStatus: 'error',
      syncProgress: { phase: 'error', contacts: 3, conversations: 2, messages: 3, errorId },
    })
    break
  }
  case 'upsert': {
    await internal.onMessagesUpsert({
      messages: ['first', 'conflict', 'last'].map(message),
      type: 'notify',
    })
    assert.deepEqual(saved, ['first', 'last'])
    assert.deepEqual(events, ['inbound-message.upsert', 'inbound-message.upsert'])
    break
  }
  case 'database': {
    failure = 'messages'
    await assert.rejects(
      internal.onMessagingHistorySet(payload(['one'], ['one'], ['first', 'db-error', 'last'])),
      (error) => error === databaseError,
    )
    assert.deepEqual(saved, ['first'])
    assert.equal(session.syncState.syncStatus, 'error')
    assert.equal(session.syncState.syncProgress?.messages, 1)
    failure = 'none'
    await internal.onMessagingHistorySet(payload([], [], ['later']))
    assert.deepEqual(saved, ['first', 'later'])
    assert.equal(session.syncState.syncStatus, 'error')
    break
  }
  case 'contacts-database':
  case 'conversations-database': {
    failure = process.argv[2] === 'contacts-database' ? 'contacts' : 'conversations'
    await assert.rejects(
      internal.onMessagingHistorySet(payload(['one'], ['one'], ['never'])),
      (error) => error === databaseError,
    )
    assert.deepEqual(phases, failure === 'contacts' ? ['contacts'] : ['contacts', 'conversations'])
    assert.deepEqual(saved, [])
    break
  }
  default:
    throw new Error('unknown scenario')
}
