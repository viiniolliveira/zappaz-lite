import { describe, expect, test } from 'bun:test'
import { proto, type WAProto } from 'baileys'
import sharp from 'sharp'
import { extractReplyThumbnail } from '../../server/src/lib/chat-thumbnail.ts'
import { normalizeWhatsappMessage, normalizeWhatsappMessageWithThumbnails } from '../../server/src/lib/whatsapp-event-normalizer.ts'

function envelope(message: WAProto.IMessage): WAProto.IWebMessageInfo {
  return { key: { id: 'reply', remoteJid: '123@s.whatsapp.net' }, message }
}

describe('template button replies', () => {
  test('normalizes selected text and metadata without top-level interactive', () => {
    const result = normalizeWhatsappMessage('session', envelope({ templateButtonReplyMessage: {
      selectedDisplayText: 'Sim', selectedId: 'yes', selectedIndex: 2,
    } }))
    expect(result).toMatchObject({ type: 'text', text: 'Sim', templateReply: { selectedId: 'yes', selectedIndex: 2 } })
    expect(result.interactive).toBeUndefined()
    expect(result.replyTo).toBeUndefined()
  })

  test('distinguishes protobuf index zero from an absent or null index', () => {
    for (const [input, expected] of [
      [proto.Message.TemplateButtonReplyMessage.fromObject({ selectedIndex: 0 }), 0],
      [proto.Message.TemplateButtonReplyMessage.fromObject({}), null],
      [{ selectedIndex: null, selectedDisplayText: null, selectedId: null }, null],
    ] as const) {
      const result = normalizeWhatsappMessage('session', envelope({ templateButtonReplyMessage: input }))
      expect(result).toMatchObject({ type: 'text', text: '', templateReply: { selectedId: null, selectedIndex: expected } })
    }
  })

  test.each([undefined, null, {}, { participant: 'bob@lid', quotedMessage: { conversation: 'ignored' } }] as const)('does not create a reply without a stanza id: %p', contextInfo => {
    const result = normalizeWhatsappMessage('session', envelope({ templateButtonReplyMessage: { contextInfo } }))
    expect(result.replyTo).toBeUndefined()
  })

  test('normalizes the quoted text template separately from the selected reply', () => {
    const result = normalizeWhatsappMessage('session', envelope({ templateButtonReplyMessage: {
      selectedDisplayText: 'Sim', selectedId: 'yes', selectedIndex: 0,
      contextInfo: { stanzaId: 'original', participant: 'bob@lid', quotedMessage: { templateMessage: { hydratedTemplate: {
        hydratedContentText: 'Confirma?', hydratedButtons: [{ quickReplyButton: { displayText: 'Sim', id: 'yes' } }],
      } } } },
    } }))
    expect(result).toMatchObject({ type: 'text', text: 'Sim', templateReply: { selectedId: 'yes', selectedIndex: 0 }, replyTo: {
      id: 'original', senderId: 'bob@lid', type: 'text', text: 'Confirma?', interactive: { buttons: [{ kind: 'reply', text: 'Sim', id: 'yes', url: null }] },
    } })
    expect(result.interactive).toBeUndefined()
  })

  test.each(['image', 'video'] as const)('extracts quoted template %s header thumbnail', async kind => {
    const jpeg = await sharp({ create: { width: 13, height: 7, channels: 3, background: '#c30' } }).jpeg().toBuffer()
    const header = kind === 'image' ? { imageMessage: { mimetype: 'image/jpeg', jpegThumbnail: jpeg } } : { videoMessage: { mimetype: 'video/mp4', jpegThumbnail: jpeg } }
    const content: WAProto.IMessage = { templateButtonReplyMessage: { selectedDisplayText: 'Sim', contextInfo: {
      stanzaId: 'original', quotedMessage: { templateMessage: { hydratedFourRowTemplate: { ...header, hydratedContentText: 'Escolha' } } },
    } } }
    const thumbnail = { mimeType: 'image/jpeg', base64: jpeg.toString('base64'), width: 13, height: 7 }
    expect(await extractReplyThumbnail(content)).toEqual(thumbnail)
    const result = await normalizeWhatsappMessageWithThumbnails('session', envelope(content))
    expect(result).toMatchObject({ type: 'text', text: 'Sim', replyTo: { id: 'original', type: kind, text: 'Escolha', media: { thumbnail }, interactive: { buttons: [] } } })
    expect(result.interactive).toBeUndefined()
    expect(result.replyTo?.media?.downloadPath).toBeUndefined()
  })

  test('keeps unsupported messages unknown', () => {
    expect(normalizeWhatsappMessage('session', envelope({ protocolMessage: {} })).type).toBe('unknown')
  })
})
