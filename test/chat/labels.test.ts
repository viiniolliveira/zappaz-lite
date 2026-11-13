import { afterEach, describe, expect, test } from 'bun:test'
import type { AxiosAdapter, InternalAxiosRequestConfig } from 'axios'
import { z } from 'zod'
import {
  ConversationLabelsSchema,
  SaveLabelSchema,
} from '../../server/src/modules/conversation-labels/schema.ts'
import { ConversationQuerySchema } from '../../server/src/modules/conversations/schema.ts'
import { api } from '../../src/lib/api-client.ts'
import {
  bulkLabelsFormSchema,
  getBulkLabelState,
  labelFormSchema,
} from '../../src/lib/chat/labels.ts'
import { getChatConversations } from '../../src/services/chat.ts'
import {
  deleteChatLabel,
  getChatLabels,
  saveChatLabel,
  setChatConversationLabels,
} from '../../src/services/chat-labels.ts'
import { mockConversations, mockSessionId } from './mock-data.ts'

const id = '00000000-0000-4000-8000-000000000001'
const label = {
  id,
  sessionId: mockSessionId,
  name: 'Importante',
  description: '',
  color: '#14b8a6',
}
const original = api.defaults.adapter
const calls: InternalAxiosRequestConfig[] = []
function respond(data: unknown) {
  const adapter: AxiosAdapter = async (config) => {
    calls.push(config)
    return { config, data: { status: 'success', data }, headers: {}, status: 200, statusText: 'OK' }
  }
  api.defaults.adapter = adapter
}
afterEach(() => {
  api.defaults.adapter = original
  calls.length = 0
})

describe('conversation labels contract', () => {
  test('aggregates checked, mixed and absent labels across the entire selection', () => {
    const conversations = [
      { labelIds: ['common', 'partial'] },
      { labelIds: ['common'] },
      { labelIds: ['common', 'partial'] },
    ]
    expect(getBulkLabelState(conversations, 'common')).toBe(true)
    expect(getBulkLabelState(conversations, 'partial')).toBe('indeterminate')
    expect(getBulkLabelState(conversations, 'absent')).toBe(false)
    expect(getBulkLabelState([], 'common')).toBe(false)
    expect(getBulkLabelState([{ labelIds: ['partial'] }], 'partial')).toBe(true)
  })
  test('validates combined bulk checkbox changes without operation modes', () => {
    const other = '00000000-0000-4000-8000-000000000002'
    expect(bulkLabelsFormSchema.parse({ changes: { [id]: true, [other]: false } })).toEqual({
      changes: { [id]: true, [other]: false },
    })
    expect(bulkLabelsFormSchema.safeParse({ changes: { bad: true } }).success).toBe(false)
    expect(bulkLabelsFormSchema.safeParse({ changes: { [id]: 'true' } }).success).toBe(false)
  })
  test('validates names, descriptions, hex colors and unique label IDs', () => {
    expect(
      labelFormSchema.parse({ name: 'Cor personalizada', description: '', color: '#123456' }).color,
    ).toBe('#123456')
    expect(
      SaveLabelSchema.parse({ name: '  Cliente  ', description: '', color: '#AABBCC' }),
    ).toEqual({ name: 'Cliente', description: '', color: '#aabbcc' })
    for (const input of [
      { name: '', description: '', color: '#14b8a6' },
      { name: 'a'.repeat(61), description: '', color: '#14b8a6' },
      { name: 'Cliente', description: 'a'.repeat(501), color: '#14b8a6' },
      { name: 'Cliente', description: '', color: 'red' },
      { name: 'Cliente', description: '', color: '#abc' },
    ]) {
      expect(SaveLabelSchema.safeParse(input).success).toBe(false)
      expect(labelFormSchema.safeParse(input).success).toBe(false)
    }
    expect(ConversationLabelsSchema.parse({ labelIds: [] })).toEqual({ labelIds: [] })
    expect(ConversationLabelsSchema.safeParse({ labelIds: [id, id] }).success).toBe(false)
    expect(ConversationLabelsSchema.safeParse({ labelIds: ['bad'] }).success).toBe(false)
    expect(ConversationLabelsSchema.safeParse({ labelIds: [], contactId: id }).success).toBe(false)
  })
  test('accepts only one label filter combined with text and pagination', () => {
    expect(ConversationQuerySchema.parse({ q: 'Maria', labelId: id, limit: 10 })).toEqual({
      q: 'Maria',
      labelId: id,
      limit: 10,
    })
    expect(ConversationQuerySchema.safeParse({ labelId: [id, id] }).success).toBe(false)
    expect(ConversationQuerySchema.safeParse({ labelId: 'bad' }).success).toBe(false)
  })
  test('lists, creates, edits and deletes labels in the selected session', async () => {
    respond([label])
    expect(await getChatLabels(mockSessionId)).toEqual([label])
    respond(label)
    const input = { name: label.name, description: '', color: label.color }
    await saveChatLabel(mockSessionId, input)
    await saveChatLabel(mockSessionId, input, id)
    respond({ labelId: id })
    await deleteChatLabel(mockSessionId, id)
    expect(calls.map((call) => call.method)).toEqual(['get', 'post', 'patch', 'delete'])
    expect(
      calls.every(
        (call) =>
          call.url?.startsWith(`/api/v1/session/${mockSessionId}/conversation-labels`) &&
          call.withCredentials,
      ),
    ).toBe(true)
    expect(JSON.parse(calls[1].data)).toEqual(input)
    respond([{ ...label, color: 'invalid' }])
    await expect(getChatLabels(mockSessionId)).rejects.toBeInstanceOf(z.ZodError)
  })
  test('replaces multiple conversation labels and allows removing all', async () => {
    respond({ ...mockConversations[0], labelIds: [id] })
    const result = await setChatConversationLabels('session /?', mockConversations[0].id, [id])
    expect(result.labelIds).toEqual([id])
    expect(calls[0].url).toBe(
      `/api/v1/session/session%20%2F%3F/conversations/${mockConversations[0].id}/labels`,
    )
    expect(calls[0].method).toBe('put')
    expect(JSON.parse(calls[0].data)).toEqual({ labelIds: [id] })
    respond({ ...mockConversations[0], labelIds: [] })
    expect(
      (await setChatConversationLabels(mockSessionId, mockConversations[0].id, [])).labelIds,
    ).toEqual([])
    expect(JSON.parse(calls[1].data)).toEqual({ labelIds: [] })
  })
  test('sends a single label ID with the conversation search', async () => {
    api.defaults.adapter = async (config) => {
      calls.push(config)
      return {
        config,
        data: { status: 'success', data: [], page: { hasMore: false, nextCursor: null } },
        headers: {},
        status: 200,
        statusText: 'OK',
      }
    }
    await getChatConversations(mockSessionId, { q: 'Maria', labelId: id })
    expect(calls[0].params).toEqual({ q: 'Maria', labelId: id })
  })
})
