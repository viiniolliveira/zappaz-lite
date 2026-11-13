import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { randomUUID } from 'node:crypto'
import { Client } from 'pg'

const databaseUrl = process.env.CHAT_TEST_DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('chat database constraints', () => {
  const sessionA = randomUUID()
  const sessionB = randomUUID()
  const contactA = randomUUID()
  const conversationA = randomUUID()
  const conversationA2 = randomUUID()
  const conversationB = randomUUID()
  const messageA = randomUUID()
  const messageB = randomUUID()
  const whatsappId = randomUUID()
  let client: Client

  async function insertMessage(id: string, session: string, conversation: string, messageId: string) {
    await client.query(
      `INSERT INTO "WaMessage" ("id", "sessionId", "conversationId", "messageId", "rawContent", "updatedAt") VALUES ($1, $2, $3, $4, '{}', NOW())`,
      [id, session, conversation, messageId],
    )
  }

  async function insertMedia(id: string, session: string, conversation: string, message: string) {
    await client.query(
      `INSERT INTO "WaMessageMedia" ("id", "sessionId", "conversationId", "messageId", "kind", "updatedAt") VALUES ($1, $2, $3, $4, 'image', NOW())`,
      [id, session, conversation, message],
    )
  }

  beforeAll(async () => {
    client = new Client({ connectionString: databaseUrl })
    await client.connect()
    await client.query(`INSERT INTO "WaSession" ("id", "updatedAt") VALUES ($1, NOW()), ($2, NOW())`, [sessionA, sessionB])
    await client.query(`INSERT INTO "WaContact" ("id", "sessionId", "jid", "updatedAt") VALUES ($1, $2, $1, NOW())`, [contactA, sessionA])
    await client.query(`INSERT INTO "WaConversation" ("id", "sessionId", "contactId", "jid", "updatedAt") VALUES ($1, $2, $3, $1, NOW()), ($4, $2, NULL, $4, NOW()), ($5, $6, NULL, $5, NOW())`, [conversationA, sessionA, contactA, conversationA2, conversationB, sessionB])
    await insertMessage(messageA, sessionA, conversationA, whatsappId)
    await insertMessage(messageB, sessionB, conversationB, whatsappId)
  })

  afterAll(async () => {
    if (!client) return
    try {
      await client.query(`DELETE FROM "WaConversation" WHERE "id" = ANY($1::text[])`, [[conversationA, conversationA2, conversationB]])
      await client.query(`DELETE FROM "WaSession" WHERE "id" = ANY($1::text[])`, [[sessionA, sessionB]])
    } finally {
      await client.end()
    }
  })

  test('rejects a conversation referencing a contact from another session', async () => {
    await expect(client.query(`INSERT INTO "WaConversation" ("id", "sessionId", "contactId", "jid", "updatedAt") VALUES ($1, $2, $3, $1, NOW())`, [randomUUID(), sessionB, contactA])).rejects.toMatchObject({ code: '23503' })
  })

  test('rejects a message referencing a conversation from another session', async () => {
    await expect(insertMessage(randomUUID(), sessionB, conversationA, randomUUID())).rejects.toMatchObject({ code: '23503' })
  })

  test('scopes WhatsApp message uniqueness to each conversation', async () => {
    await expect(insertMessage(randomUUID(), sessionA, conversationA, whatsappId)).rejects.toMatchObject({ code: '23505' })
    const id = randomUUID()
    await insertMessage(id, sessionA, conversationA2, whatsappId)
    const result = await client.query(`SELECT "id" FROM "WaMessage" WHERE "id" = $1`, [id])
    expect(result.rowCount).toBe(1)
  })

  test('allows the same WhatsApp message ID in different sessions', async () => {
    const result = await client.query(`SELECT "id" FROM "WaMessage" WHERE "id" = ANY($1::text[]) AND "messageId" = $2`, [[messageA, messageB], whatsappId])
    expect(result.rows.map((row) => row.id).sort()).toEqual([messageA, messageB].sort())
  })

  test('requires media to reference a message in the same session and conversation', async () => {
    await expect(insertMedia(randomUUID(), sessionA, conversationA2, messageA)).rejects.toMatchObject({ code: '23503' })
    await expect(insertMedia(randomUUID(), sessionB, conversationB, messageA)).rejects.toMatchObject({ code: '23503' })
    await expect(insertMedia(randomUUID(), sessionB, conversationA, messageA)).rejects.toMatchObject({ code: '23503' })
  })

  test('allows only one media record per message and cascades deletion', async () => {
    const message = randomUUID()
    const media = randomUUID()
    await insertMessage(message, sessionA, conversationA, randomUUID())
    await insertMedia(media, sessionA, conversationA, message)
    await expect(insertMedia(randomUUID(), sessionA, conversationA, message)).rejects.toMatchObject({ code: '23505' })
    await client.query(`DELETE FROM "WaMessage" WHERE "id" = $1`, [message])
    const result = await client.query(`SELECT "id" FROM "WaMessageMedia" WHERE "id" = $1`, [media])
    expect(result.rowCount).toBe(0)
  })
})
