import { strict as assert } from 'node:assert'
import { mock } from 'bun:test'

type Media = { id: string; sessionId: string; conversationId: string; storage: string | null; key: string | null; mimeType: string; fileName: string; message: { id: string; messageId: string }; conversation: { jid: string } }
let media: Media | null = { id: 'media', sessionId: 's', conversationId: 'c', storage: null, key: null, mimeType: 'image/png', fileName: 'file.png', message: { id: 'internal', messageId: 'wa' }, conversation: { jid: 'contact' } }
let query: unknown
let conversationQuery: unknown
let isGroup = false
let enabled = true
let connected = true
let download: Buffer | null = Buffer.from('downloaded')
let calls = 0
let downloadGate: Promise<void> | undefined
let downloadStarted: (() => void) | undefined
let putFailure = false
let puts = 0
let stored = false
let updates: Record<string, unknown>[] = []
let messageUpdates: unknown[] = []
let conversationUpdates: unknown[] = []
let published: unknown[] = []
let transactions = 0
let completedTransactions = 0
let atPut: unknown
let storage: { name: string; disk: typeof disk } | null = null
let storedSize = 6
let storedBytes = Buffer.from('cached')
let reads = 0
const disk = {
  exists: async () => stored,
  getMetaData: async () => ({ contentLength: storedSize }),
  getBytes: async () => { reads++; return storedBytes },
  put: async (key: string, bytes: Buffer) => { puts++; atPut = { transactions, completedTransactions, updates: [...updates], messageUpdates: [...messageUpdates], conversationUpdates: [...conversationUpdates], published: [...published] }; if (putFailure) throw new Error('secret storage failure'); assert.equal(key, 's/c/wa'); assert.equal(bytes.toString(), 'downloaded') },
}
const prisma = { waConversation: {
  findFirst: async (input: unknown) => { conversationQuery = input; return isGroup ? null : { id: 'c' } },
}, waMessageMedia: {
  findFirst: async (input: unknown) => { if (!(input as { select?: unknown }).select) query = input; return media },
  update: async (input: { data: Record<string, unknown> }) => { if (!media) throw new Error("record deleted"); updates.push(input.data) },
  updateMany: async (input: { data: Record<string, unknown> }) => { if (!media) return { count: 0 }; updates.push(input.data); return { count: 1 } },
} }
mock.module('@db/prisma', () => ({ prisma }))
mock.module('../../server/src/services/whatsapp.ts', () => ({ whatsappService: {
  isSessionEnabled: () => enabled, isSessionConnected: () => connected,
  downloadConversationMedia: async () => { calls++; downloadStarted?.(); await downloadGate; return download },
} }))
mock.module('../../server/src/lib/media-storage.ts', () => ({ getMediaStorage: () => storage, mediaStorageKey: (...parts: string[]) => parts.join('/') }))
mock.module('../../server/src/lib/chat-media-lock.ts', () => ({ withConversationMediaLock: async (_session: string, _conversation: string, fn: (tx: unknown) => Promise<void>) => { transactions++; await fn({ waMessageMedia: prisma.waMessageMedia, waMessage: { update: async (input: unknown) => { messageUpdates.push(input) } }, waConversation: { update: async (input: unknown) => { conversationUpdates.push(input) } } }); completedTransactions++ } }))
mock.module('../../server/src/lib/chat-store.ts', () => ({ chatTransaction: async (_session: string, fn: (tx: { waMessageMedia: typeof prisma.waMessageMedia; waMessage: { update: (input: unknown) => Promise<void> }; waConversation: { update: (input: unknown) => Promise<void> } }) => Promise<void>) => { transactions++; await fn({ waMessageMedia: prisma.waMessageMedia, waMessage: { update: async (input: unknown) => { messageUpdates.push(input) } }, waConversation: { update: async (input: unknown) => { conversationUpdates.push(input) } } }); completedTransactions++ } }))
mock.module('../../server/src/lib/chat-events.ts', () => ({ publishChatChange: (event: unknown) => published.push(event), onChatChange: () => () => {} }))
mock.module('../../server/src/lib/logger.ts', () => ({ logger: { error: () => {}, warn: () => {} } }))
const { AppError } = await import('../../server/src/common/errors/app-error.ts')
const { retrieveChatMedia } = await import('../../server/src/lib/chat-media.ts')
const get = () => retrieveChatMedia('s', 'c', 'media')
const result = await get()
assert.equal(result.bytes.toString(), 'downloaded')
assert.equal(result.mimeType, 'image/png')
assert.deepEqual(conversationQuery, { where: { sessionId: 's', id: 'c', isGroup: false }, select: { id: true } })
assert.deepEqual(query.where, { sessionId: 's', conversationId: 'c', id: 'media', conversation: { isGroup: false }, message: { deletedAt: null } })
assert.equal(updates.length, 0)

storage = { name: 'local', disk }
stored = true
enabled = false
media.storage = 'local'; media.key = 's/c/wa'
assert.equal((await get()).bytes.toString(), 'cached')
assert.equal(calls, 1)
storedSize = 1024 * 1024 + 1
const previousReads = reads
await assert.rejects(get(), (error: unknown) => error instanceof AppError && error.code === 'PAYLOAD_TOO_LARGE' && error.status === 413)
assert.equal(reads, previousReads)
storedSize = 1024 * 1024
storedBytes = Buffer.alloc(1024 * 1024 + 1)
await assert.rejects(get(), (error: unknown) => error instanceof AppError && error.code === 'PAYLOAD_TOO_LARGE' && error.status === 413)
storedBytes = Buffer.alloc(1024 * 1024)
assert.equal((await get()).bytes.length, 1024 * 1024)
storedSize = 6; storedBytes = Buffer.from('cached')
stored = false
await assert.rejects(get(), (error: unknown) => error instanceof AppError && error.code === 'SESSION_NOT_ENABLED' && error.status === 409)
enabled = true; connected = false
await assert.rejects(get(), (error: unknown) => error instanceof AppError && error.code === 'SESSION_NOT_CONNECTED' && error.status === 409)
connected = true
download = null
await assert.rejects(get(), (error: unknown) => error instanceof AppError && error.code === 'MEDIA_UNAVAILABLE' && error.status === 404)
download = Buffer.from('downloaded')
const pending = { storageStatus: 'pending', revision: { increment: 1 } }
const messageUpdate = { where: { id: 'internal' }, data: { revision: { increment: 1 } } }
const conversationUpdate = { where: { id: 'c' }, data: { revision: { increment: 1 } } }
const event = { sessionId: 's', conversationId: 'c', messageId: 'internal', mediaId: 'media', source: 'update' }
const expectedAtPut = { transactions: 2, completedTransactions: 1, updates: [pending], messageUpdates: [messageUpdate], conversationUpdates: [conversationUpdate], published: [event] }
assert.equal((await get()).bytes.toString(), 'downloaded')
assert.deepEqual(atPut, expectedAtPut)
assert.deepEqual(updates[0], pending)
assert.equal(updates[1].storageStatus, 'ready')
assert.equal(transactions, 2)
assert.equal(completedTransactions, 2)
assert.deepEqual(messageUpdates, [messageUpdate, messageUpdate])
assert.deepEqual(conversationUpdates, [conversationUpdate, conversationUpdate])
assert.deepEqual(published, [event, event])
updates = []; messageUpdates = []; conversationUpdates = []; published = []; transactions = 0; completedTransactions = 0; putFailure = true
assert.equal((await get()).bytes.toString(), 'downloaded')
assert.deepEqual(atPut, expectedAtPut)
assert.deepEqual(updates[0], pending)
assert.deepEqual(updates[1], { storageStatus: 'failed', revision: { increment: 1 } })
assert.equal(transactions, 3)
assert.equal(completedTransactions, 2)
assert.deepEqual(messageUpdates, [messageUpdate, messageUpdate])
assert.deepEqual(conversationUpdates, [conversationUpdate, conversationUpdate])
assert.deepEqual(published, [event, event])
media.storage = 's3'
await assert.rejects(get(), (error: unknown) => error instanceof AppError && error.code === 'STORAGE_UNAVAILABLE' && !error.message.includes('secret'))
media.storage = null; media.key = null; storage = null
let releaseDownload!: () => void
downloadGate = new Promise<void>((resolve) => { releaseDownload = resolve })
const started = new Promise<void>((resolve) => { downloadStarted = resolve })
const previousCalls = calls
const background = retrieveChatMedia('s', 'c', 'media', false)
await started
isGroup = true
await assert.rejects(get(), (error: unknown) => error instanceof AppError && error.status === 404 && error.message === 'Media not found')
isGroup = false
const foreground = get()
// Allow the private-conversation lookup to finish before completing the download.
await Promise.resolve()
releaseDownload()
const [backgroundResult, foregroundResult] = await Promise.all([background, foreground])
assert.equal(backgroundResult.bytes.toString(), 'downloaded')
assert.equal(foregroundResult.bytes.toString(), 'downloaded')
assert.equal(calls, previousCalls + 1)
downloadGate = undefined; downloadStarted = undefined
media = null
await assert.rejects(get(), (error: unknown) => error instanceof AppError && error.status === 404 && error.message === 'Media not found')

// A download that finishes after deletion must not return bytes or write a file.
media = { id: 'media', sessionId: 's', conversationId: 'c', storage: null, key: null, mimeType: 'image/png', fileName: 'file.png', message: { id: 'internal', messageId: 'wa' }, conversation: { jid: 'contact' } }
storage = null
downloadGate = new Promise<void>((resolve) => { releaseDownload = resolve })
const deletionStarted = new Promise<void>((resolve) => { downloadStarted = resolve })
const afterDeletion = get()
await deletionStarted
media = null
releaseDownload()
await assert.rejects(afterDeletion, (error: unknown) => error instanceof AppError && error.status === 404)

// Even when persistence is enabled, the post-download lock must prevent a late put.
media = { id: 'media', sessionId: 's', conversationId: 'c', storage: null, key: null, mimeType: 'image/png', fileName: 'file.png', message: { id: 'internal', messageId: 'wa' }, conversation: { jid: 'contact' } }
storage = { name: 'local', disk }
putFailure = false
const previousPuts = puts
downloadGate = new Promise<void>((resolve) => { releaseDownload = resolve })
const persistenceStarted = new Promise<void>((resolve) => { downloadStarted = resolve })
const persistenceAfterDeletion = get()
await persistenceStarted
media = null
releaseDownload()
await assert.rejects(persistenceAfterDeletion, (error: unknown) => error instanceof AppError && error.status === 404)
assert.equal(puts, previousPuts)
