import { conversationSchema, messageSchema, type MessageDTO } from '../../src/lib/chat/schemas'
import type { ChatConversation } from '../../src/lib/chat/types'
import { mockThumbnailBase64 } from './mock-thumbnail'

export const mockSessionId = '11111111-1111-4111-8111-111111111111'
const date = '2026-10-31T12:00:00.000Z'
const uuid = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`

export function mockMessage(value: number, conversationId: string, overrides: Partial<MessageDTO> = {}): MessageDTO {
  return messageSchema.parse({
    id: uuid(value), sessionId: mockSessionId, conversationId, messageId: `WA-DEMO-${value}`,
    clientRequestId: null, fromMe: false, sender: { jid: '5511900000101@s.whatsapp.net', name: 'Marina Costa' },
    type: 'text', text: 'Olá! Tudo bem?', hasLink: false, status: null, sentAt: date, orderAt: date,
    createdAt: date, updatedAt: date, revision: 1, editedAt: null, deletedAt: null,
    media: null, replyTo: null, linkPreview: null, interactive: null, poll: null, album: null, groupInvite: null, system: null, unavailable: null, selection: null, location: null, contacts: [], mentions: [], reactions: [], ...overrides,
  })
}

// Fixture local: IDs e conteúdo fictícios, sem envio real ao WhatsApp.
const names = ['Marina Costa', 'Rafael Almeida', 'Beatriz Santos', 'Lucas Ferreira', 'Camila Oliveira', 'Contato sem histórico']
export const mockConversations: ChatConversation[] = names.map((displayName, index) => {
  const id = uuid(index + 1)
  const jid = index === 4 ? '123456789@lid' : `551190000010${index}@s.whatsapp.net`
  const messages = index === 5 ? [] : [
    mockMessage(100 + index * 10, id),
    mockMessage(101 + index * 10, id, { fromMe: true, text: 'Claro, vou conferir para você.', status: 'read' }),
    mockMessage(102 + index * 10, id, { type: 'unknown', text: null, sentAt: null }),
    mockMessage(103 + index * 10, id, { text: null, deletedAt: date }),
    mockMessage(104 + index * 10, id, {
      text: 'Obrigada pela ajuda!', replyTo: { messageRecordId: null, messageId: 'WA-OUTSIDE-HISTORY', senderJid: null, type: 'text', text: 'Posso ajudar?', contacts: [], media: null },
      reactions: [{ senderJid: jid, fromMe: false, emoji: '❤️', timestamp: null }],
    }),
  ]
  if (index === 0) {
    for (const [offset, kind] of (['image', 'video', 'audio', 'document', 'sticker'] as const).entries()) {
      const messageId = uuid(200 + offset)
      messages.push(mockMessage(200 + offset, id, {
        type: kind, text: kind === 'image' ? 'Prévia disponível antes do arquivo completo.' : null,
        media: {
          id: uuid(300 + offset), sessionId: mockSessionId, conversationId: id, messageRecordId: messageId,
          kind, mimeType: { image: 'image/jpeg', video: 'video/mp4', audio: 'audio/ogg', document: 'application/pdf', sticker: 'image/webp' }[kind],
          fileName: kind === 'document' ? 'exemplo.pdf' : null, size: null, duration: null, width: null, height: null,
          voice: kind === 'audio', thumbnail: kind === 'image' || kind === 'video' ? { mimeType: 'image/jpeg', base64: mockThumbnailBase64, width: 80, height: 60 } : null,
          storageStatus: 'not_saved', contentPath: `/api/v1/session/${mockSessionId}/conversations/${id}/media/${uuid(300 + offset)}/content`,
          createdAt: date, updatedAt: date, revision: 1,
        },
      }))
    }
    messages.push(mockMessage(210, id, { type: 'location', text: null, location: { latitude: -23.5505, longitude: -46.6333, name: 'São Paulo', address: null, thumbnail: null } }))
    messages.push(mockMessage(211, id, { type: 'contact', text: null, contacts: [{ name: 'Contato compartilhado', vcard: null, parsed: null }] }))
  }
  const contact = index === 3 ? null : {
    id: uuid(50 + index), sessionId: mockSessionId, jid,
    phoneNumber: jid.endsWith('@lid') ? null : `551190000010${index}`,
    name: displayName, pushName: null, displayName, avatarUrl: null, avatarCheckedAt: null,
    createdAt: date, updatedAt: date, revision: 1,
  }
  return {
    ...conversationSchema.parse({
      id, sessionId: mockSessionId, jid, contactId: contact?.id ?? null, contact, displayName,
      avatarUrl: null, isGroup: false, lastMessage: messages.at(-1) ?? null,
      lastActivityAt: messages.length ? date : null, unreadCount: index === 1 ? 2 : 0,
      labelIds: [], lastReadMessageRecordId: null, createdAt: date, updatedAt: date, revision: 1,
    }), messages,
  }
})
