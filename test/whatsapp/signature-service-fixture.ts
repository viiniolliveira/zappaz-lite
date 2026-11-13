import { mock } from 'bun:test'
import { strict as assert } from 'node:assert'
import { signTextMessage } from '../../server/src/lib/message-signature.ts'
import type { TextSignature } from '../../server/src/common/schema.ts'

const calls: unknown[][] = []
mock.module('@db/prisma', () => ({
  prisma: {
    globalWebhook: { findMany: async () => [] },
    webhook: { findMany: async () => [] },
  },
}))
mock.module('@lib/whatsapp-session', () => ({
  WhatsappSession: class {
    jid: string | null = null
    webhooks: unknown[] = []
    constructor(
      _id: string,
      public enabled: boolean,
      private config: { signatureEnabled: boolean; signatureName: string },
    ) {}
    signTextMessage(text: string, options?: TextSignature) {
      return signTextMessage(text, this.config, options)
    }
    async sendMessage(...args: unknown[]) {
      calls.push(args)
      return { key: { id: 'sent' } }
    }
  },
}))

const { whatsappService } = await import('../../server/src/services/whatsapp.ts')
const { CreateSessionConfigSchema } = await import('../../server/src/common/schema.ts')
const config = CreateSessionConfigSchema.parse({ signatureEnabled: true, signatureName: 'Alice' })
await whatsappService.loadSession({
  id: 's',
  enabled: true,
  displayName: 'Test',
  userId: 'user',
  sessionConfig: config,
})

await whatsappService.sendTextMessage('s', {
  number: '5511999999999',
  message: 'Olá',
  linkPreview: false,
  mentions: ['5511888888888'],
  quoted: 'quote',
  delay: 50,
})
assert.deepEqual(calls.at(-1), [
  '5511999999999@s.whatsapp.net',
  { text: '*Alice:*\nOlá', linkPreview: null, mentions: ['5511888888888@s.whatsapp.net'] },
  'text',
  { delay: 50, quoted: 'quote' },
])
await whatsappService.sendTextMessage('s', {
  number: '5511999999999',
  message: 'Olá',
  linkPreview: true,
  signMessage: false,
  signatureName: 'Bob',
})
assert.deepEqual(calls.at(-1)?.[1], { text: 'Olá', linkPreview: undefined })
await whatsappService.sendChatMessage(
  's',
  '123@s.whatsapp.net',
  { text: 'Oi' },
  'text',
  'request',
  'quote',
  { signatureName: 'Bob' },
)
assert.deepEqual(calls.at(-1), [
  '123@s.whatsapp.net',
  { text: '*Bob:*\nOi' },
  'text',
  { clientRequestId: 'request', quoted: 'quote' },
])
await whatsappService.sendChatMessage(
  's',
  '123@s.whatsapp.net',
  { text: 'Oi' },
  'text',
  'request',
  undefined,
  { signMessage: false },
)
assert.equal((calls.at(-1)?.[1] as { text: string }).text, 'Oi')
const image = { image: Buffer.from('image'), caption: 'Legenda' }
await whatsappService.sendChatMessage(
  's',
  '123@s.whatsapp.net',
  image,
  'image',
  'request',
  undefined,
  { signMessage: true, signatureName: 'Bob' },
)
assert.deepEqual(calls.at(-1), [
  '123@s.whatsapp.net',
  image,
  'image',
  { clientRequestId: 'request', quoted: undefined },
])
await assert.rejects(() =>
  whatsappService.sendTextMessage('missing', { number: '1', message: 'text', linkPreview: true }),
)
await assert.rejects(() =>
  whatsappService.sendChatMessage(
    'missing',
    '1@s.whatsapp.net',
    { text: 'text' },
    'text',
    'request',
  ),
)
