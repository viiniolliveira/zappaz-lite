import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { webhookPayloadsDocumentation } from '../../server/src/modules/docs/webhook-payloads.ts'
import { WebhookEventsSchema } from '../../server/src/modules/webhooks/schema.ts'

const examples = [...webhookPayloadsDocumentation.matchAll(/```json\s*\n([\s\S]*?)\n```/g)].map(
  ([, json]) => JSON.parse(json),
)
const messages = examples.flatMap((example) =>
  example.payload?.message ? [example.payload.message] : [],
)

describe('webhook payload documentation', () => {
  test('JSON examples are complete envelopes for supported events', () => {
    expect(examples.length).toBeGreaterThan(0)
    for (const example of examples) {
      expect(Object.keys(example).sort()).toEqual(['event', 'payload', 'session'])
      expect(Object.keys(WebhookEventsSchema.shape)).toContain(example.event)
      expect(example.payload).toBeObject()
      expect(example.session.id).toBeString()
      expect(example.session.status).toBeString()
      expect(example.session).toHaveProperty('jid')
    }
    for (const message of messages) {
      expect(message).toHaveProperty('id')
      expect(message).toHaveProperty('chatId')
      expect(message).toHaveProperty('remoteJid')
      expect(message).toHaveProperty('lid')
      expect(typeof message.fromMe).toBe('boolean')
      expect(typeof message.isGroup).toBe('boolean')
      expect(message.sender).toHaveProperty('id')
      expect(message).toHaveProperty('timestamp')
      expect(message).not.toHaveProperty('rawContent')
    }
  })

  test('illustrates text, reply, media, location and shared contacts', () => {
    expect(messages.some((message) => message.type === 'text' && message.text)).toBe(true)
    expect(
      messages.some((message) => message.replyTo?.id && message.replyTo.id !== message.id),
    ).toBe(true)
    expect(
      messages.some((message) => message.media?.downloadPath && message.media?.thumbnail),
    ).toBe(true)
    expect(messages.some((message) => message.type === 'location' && message.location)).toBe(true)
    expect(
      messages.some((message) => message.type === 'contact' && message.contacts?.[0]?.parsed),
    ).toBe(true)
  })

  test('illustrates interactive actions, lists and polls as message contents, not invented events', () => {
    expect(messages.some((message) => message.interactive?.buttons?.length > 0)).toBe(true)
    expect(
      messages.some((message) =>
        message.interactive?.list?.sections?.some(
          (section: { rows: unknown[] }) => section.rows.length > 0,
        ),
      ),
    ).toBe(true)
    expect(
      messages.some((message) => message.type === 'poll' && message.poll?.options?.length > 0),
    ).toBe(true)
  })

  test('status, reactions and receipts use the actual event payload collections', () => {
    for (const [event, field] of [
      ['messages.update', 'messages'],
      ['messages.reaction', 'reactions'],
      ['message-receipt.update', 'receipts'],
    ]) {
      const example = examples.find((item) => item.event === event)
      expect(example).toBeDefined()
      expect(Array.isArray(example.payload[field])).toBe(true)
      expect(example.payload[field].length).toBeGreaterThan(0)
      const reference = example.payload[field][0]
      for (const key of ['id', 'chatId', 'remoteJid', 'lid', 'fromMe']) {
        expect(reference).toHaveProperty(key)
      }
    }
    expect(
      examples.find((item) => item.event === 'messages.update').payload.messages[0],
    ).toHaveProperty('status')
    expect(
      examples.find((item) => item.event === 'messages.reaction').payload.reactions[0],
    ).toHaveProperty('sender')
    expect(
      examples.find((item) => item.event === 'message-receipt.update').payload.receipts[0],
    ).toHaveProperty('recipientId')
  })

  test('describes message types and normalized events outside JSON examples', () => {
    const description = webhookPayloadsDocumentation.replace(/```json\s*\n[\s\S]*?\n```/g, '')
    for (const value of [
      'text',
      'image',
      'location',
      'contact',
      'poll',
      'unknown',
      'inbound-message.upsert',
      'outbound-message.upsert',
      'messages.update',
      'messages.reaction',
      'message-receipt.update',
    ]) {
      expect(description).toContain(value)
    }
    const markdown = readFileSync(
      new URL('../../docs/webhook-payloads.md', import.meta.url),
      'utf8',
    )
    expect(markdown).toContain('/docs')
  })
})
