import { describe, expect, test } from 'bun:test'
import { proto } from 'baileys'
import sharp from 'sharp'
import {
  normalizeMessageReactions,
  normalizeMessageReceipts,
  normalizeMessageReference,
  normalizeMessageStatus,
  normalizeMessageUpdates,
  normalizeTimestamp,
  normalizeWhatsappMessage,
  normalizeWhatsappMessageWithThumbnails,
} from '../../server/src/lib/whatsapp-event-normalizer.ts'

describe('webhook media thumbnails', () => {
  test.each(['imageMessage', 'videoMessage', 'documentMessage'] as const)('includes a valid %s thumbnail in media and quoted media', async kind => {
    const jpeg = await sharp({ create: { width: 13, height: 7, channels: 3, background: '#c30' } }).jpeg().toBuffer()
    const input = { key: { id: 'media', remoteJid: '123@s.whatsapp.net' }, message: { [kind]: { jpegThumbnail: jpeg, mediaKey: Buffer.from('secret'), contextInfo: { stanzaId: 'quoted', quotedMessage: { [kind]: { jpegThumbnail: jpeg, mediaKey: Buffer.from('secret') } } } } } }
    const before = structuredClone(input)
    const result = await normalizeWhatsappMessageWithThumbnails('s', input)
    const thumbnail = { mimeType: 'image/jpeg', base64: jpeg.toString('base64'), width: 13, height: 7 }
    expect(result.media?.thumbnail).toEqual(thumbnail)
    expect(result.replyTo?.media?.thumbnail).toEqual(thumbnail)
    expect(result.replyTo?.media?.downloadPath).toBeUndefined()
    expect(JSON.stringify(result)).not.toContain('mediaKey')
    expect(input).toEqual(before)
  })

  test('omits missing, invalid and oversized previews without losing the media event', async () => {
    for (const jpegThumbnail of [undefined, Buffer.from('invalid'), new Uint8Array(262145)]) {
      const result = await normalizeWhatsappMessageWithThumbnails('s', { key: { id: 'media' }, message: { imageMessage: { jpegThumbnail } } })
      expect(result.type).toBe('image')
      expect(result.media?.thumbnail).toBeUndefined()
    }
  })
})

const key = {
  id: 'message/1',
  remoteJid: 'group@g.us',
  participant: 'alice@lid',
  fromMe: false,
}
const base = { key, pushName: 'Alice', messageTimestamp: 1700000000 }
const reference = {
  id: 'message/1',
  chatId: 'group@g.us',
  remoteJid: null,
  lid: null,
  fromMe: false,
}
const common = {
  ...reference,
  isGroup: true,
  sender: { id: 'alice@lid', name: 'Alice' },
  timestamp: '2023-11-14T22:13:20.000Z',
}

describe('WhatsApp message normalization', () => {
  test('preserves location metadata without coordinates from the reported payload', () => {
    const input = {
      key: { id: 'location-example', fromMe: true, remoteJid: '5511900000000@s.whatsapp.net' },
      status: proto.WebMessageInfo.Status.PENDING,
      message: {
        locationMessage: { url: 'www.google.com', name: 'Google São Paulo', address: 'Av. Brigadeiro Faria Lima 3477, São Paulo, SP, Brasil' },
        messageContextInfo: { messageSecret: Buffer.alloc(32, 1) },
      },
      messageTimestamp: 1793650724,
    }
    const before = structuredClone(input)
    const result = normalizeWhatsappMessage('session', input)
    expect(result).toMatchObject({ type: 'location', fromMe: true, status: 'pending', location: input.message.locationMessage })
    expect(result.location).not.toHaveProperty('latitude')
    expect(result.location).not.toHaveProperty('longitude')
    const decoded = proto.WebMessageInfo.decode(proto.WebMessageInfo.encode(proto.WebMessageInfo.fromObject(input)).finish())
    expect(normalizeWhatsappMessage('session', decoded).location).toEqual(input.message.locationMessage)
    expect(input).toEqual(before)
    expect(normalizeWhatsappMessage('session', { ...input, message: { liveLocationMessage: { degreesLatitude: 0 } } }).location).toEqual({ latitude: 0 })
  })
  test('normalizes a group text without mutating its source', () => {
    const input = { ...base, status: 0, message: { conversation: 'Hello' } }
    const before = structuredClone(input)
    expect(normalizeWhatsappMessage('session', input)).toEqual({
      ...common,
      type: 'text',
      status: 'error',
      text: 'Hello',
    })
    expect(input).toEqual(before)
  })

  test('normalizes extended text, quoted message and mentions', () => {
    const message = {
      ...base,
      message: {
        extendedTextMessage: {
          text: 'Hi',
          contextInfo: {
            stanzaId: 'quoted',
            participant: 'bob@lid',
            mentionedJid: ['bob@lid'],
          },
        },
      },
    }
    expect(normalizeWhatsappMessage('s', message)).toEqual({
      ...common,
      type: 'text',
      text: 'Hi',
      replyTo: { id: 'quoted', senderId: 'bob@lid' },
      mentions: ['bob@lid'],
    })
  })

  test.each([
    [{ conversation: 'quoted text' }],
    [{ extendedTextMessage: { text: 'quoted text' } }],
  ])('preserves quoted text separately from the reply', (quotedMessage) => {
    const input = {
      ...base,
      message: {
        extendedTextMessage: {
          text: 'outer text',
          contextInfo: {
            stanzaId: 'quoted',
            participant: 'bob@lid',
            quotedMessage,
          },
        },
      },
    }
    const before = structuredClone(input)
    expect(normalizeWhatsappMessage('s', input)).toEqual({
      ...common,
      type: 'text',
      text: 'outer text',
      replyTo: {
        id: 'quoted',
        senderId: 'bob@lid',
        type: 'text',
        text: 'quoted text',
      },
    })
    expect(input).toEqual(before)
  })

  test('normalizes quoted media without secrets or an invented download path', () => {
    const input = {
      ...base,
      message: {
        extendedTextMessage: {
          text: 'reply',
          contextInfo: {
            stanzaId: 'quoted',
            quotedMessage: {
              documentMessage: {
                mimetype: 'application/pdf',
                fileName: 'report.pdf',
                fileLength: 123,
                caption: 'quoted caption',
                mediaKey: new Uint8Array([1]),
                jpegThumbnail: new Uint8Array([2]),
                url: 'https://private.invalid',
              },
            },
          },
        },
      },
    }
    const before = structuredClone(input)
    const result = normalizeWhatsappMessage('s', input)
    expect(result).toEqual({
      ...common,
      type: 'text',
      text: 'reply',
      replyTo: {
        id: 'quoted',
        type: 'document',
        text: 'quoted caption',
        media: {
          mimeType: 'application/pdf',
          fileName: 'report.pdf',
          size: 123,
        },
      },
    })
    expect(JSON.stringify(result)).not.toMatch(
      /mediaKey|jpegThumbnail|private|url|downloadPath/,
    )
    expect(input).toEqual(before)
  })

  test.each([
    'ephemeralMessage',
    'viewOnceMessage',
    'viewOnceMessageV2',
    'documentWithCaptionMessage',
  ])('unwraps a quoted %s', (wrapper) => {
    const quotedMessage = {
      [wrapper]: {
        message: {
          documentMessage: { caption: 'wrapped', mimetype: 'application/pdf' },
        },
      },
    }
    expect(
      normalizeWhatsappMessage('s', {
        ...base,
        message: {
          extendedTextMessage: {
            text: 'reply',
            contextInfo: { stanzaId: 'quoted', quotedMessage },
          },
        },
      }).replyTo,
    ).toEqual({
      id: 'quoted',
      type: 'document',
      text: 'wrapped',
      media: { mimeType: 'application/pdf' },
    })
  })

  test('truncates nested quote and mention context even for self-references', () => {
    const quoted: any = {
      extendedTextMessage: {
        text: 'quoted',
        contextInfo: {
          stanzaId: 'quoted',
          participant: 'nested@lid',
          mentionedJid: ['nested@lid'],
        },
      },
    }
    quoted.extendedTextMessage.contextInfo.quotedMessage = quoted
    const result = normalizeWhatsappMessage('s', {
      ...base,
      message: {
        extendedTextMessage: {
          text: 'outer',
          contextInfo: {
            stanzaId: 'quoted',
            quotedMessage: quoted,
            mentionedJid: ['outer@lid'],
          },
        },
      },
    })
    expect(result).toEqual({
      ...common,
      type: 'text',
      text: 'outer',
      replyTo: { id: 'quoted', type: 'text', text: 'quoted' },
      mentions: ['outer@lid'],
    })
  })

  test.each([
    [
      {
        locationMessage: {
          degreesLatitude: 0,
          degreesLongitude: -46,
          name: 'Place',
        },
      },
      {
        type: 'location',
        location: { latitude: 0, longitude: -46, name: 'Place' },
      },
    ],
    [
      { contactMessage: { displayName: 'Bob', vcard: 'BEGIN:VCARD' } },
      { type: 'contact', contacts: [{ name: 'Bob', vcard: 'BEGIN:VCARD', parsed: null }] },
    ],
    [
      { reactionMessage: { key: { id: 'target' }, text: '' } },
      { type: 'reaction', reaction: { messageId: 'target', emoji: '' } },
    ],
    [{ protocolMessage: { type: 0 } }, { type: 'unknown' }],
  ])(
    'normalizes other quoted content with the same allowlist',
    (quotedMessage, expected) => {
      expect(
        normalizeWhatsappMessage('s', {
          ...base,
          message: {
            extendedTextMessage: {
              text: 'reply',
              contextInfo: { stanzaId: 'quoted', quotedMessage },
            },
          },
        }).replyTo,
      ).toEqual({ id: 'quoted', ...expected })
    },
  )

  test('does not create a reply without a stanza ID', () => {
    const result = normalizeWhatsappMessage('s', {
      ...base,
      message: {
        extendedTextMessage: {
          text: 'reply',
          contextInfo: { quotedMessage: { conversation: 'orphan' } },
        },
      },
    })
    expect(result.replyTo).toBeUndefined()
  })

  test.each([
    ['ephemeralMessage', { message: { conversation: 'wrapped' } }],
    ['viewOnceMessage', { message: { conversation: 'wrapped' } }],
    ['viewOnceMessageV2', { message: { conversation: 'wrapped' } }],
  ])('unwraps %s', (wrapper, value) => {
    expect(
      normalizeWhatsappMessage('s', { ...base, message: { [wrapper]: value } })
        .text,
    ).toBe('wrapped')
  })

  test('normalizes document wrapper and excludes media secrets', () => {
    const input = {
      ...base,
      message: {
        documentWithCaptionMessage: {
          message: {
            documentMessage: {
              mimetype: 'application/pdf',
              fileName: 'file.pdf',
              fileLength: 123,
              caption: 'report',
              mediaKey: new Uint8Array([1, 2]),
              jpegThumbnail: new Uint8Array([3]),
              url: 'https://private.invalid',
            },
          },
        },
      },
    }
    const result = normalizeWhatsappMessage('session /1', input)
    expect(result).toEqual({
      ...common,
      type: 'document',
      text: 'report',
      media: {
        mimeType: 'application/pdf',
        fileName: 'file.pdf',
        size: 123,
        downloadPath:
          '/api/v1/session/session%20%2F1/message/message%2F1/media/base64',
      },
    })
    expect(JSON.stringify(result)).not.toMatch(
      /mediaKey|jpegThumbnail|private|"base64"\s*:|url/,
    )
  })

  test('handles decoded protobuf Long timestamp and size, image caption, and audio voice', () => {
    const decoded = proto.WebMessageInfo.decode(
      proto.WebMessageInfo.encode(
        proto.WebMessageInfo.fromObject({
          ...base,
          message: {
            imageMessage: {
              fileLength: 9876543210,
              mimetype: 'image/jpeg',
              caption: 'photo',
            },
          },
        }),
      ).finish(),
    )
    expect(normalizeWhatsappMessage('s', decoded)).toEqual({
      ...common,
      type: 'image',
      text: 'photo',
      media: {
        mimeType: 'image/jpeg',
        size: 9876543210,
        downloadPath: '/api/v1/session/s/message/message%2F1/media/base64',
      },
    })
    expect(
      normalizeWhatsappMessage('s', {
        ...base,
        message: {
          audioMessage: { seconds: 12, ptt: true, mimetype: 'audio/ogg' },
        },
      }),
    ).toEqual({
      ...common,
      type: 'audio',
      media: {
        mimeType: 'audio/ogg',
        duration: 12,
        voice: true,
        downloadPath: '/api/v1/session/s/message/message%2F1/media/base64',
      },
    })
  })

  test('normalizes locations, contacts and reaction removal', () => {
    expect(
      normalizeWhatsappMessage('s', {
        ...base,
        message: {
          locationMessage: {
            degreesLatitude: 0,
            degreesLongitude: -46,
            name: 'Place',
            address: 'Street',
          },
        },
      }),
    ).toEqual({
      ...common,
      type: 'location',
      location: {
        latitude: 0,
        longitude: -46,
        name: 'Place',
        address: 'Street',
      },
    })
    expect(
      normalizeWhatsappMessage('s', {
        ...base,
        message: {
          contactsArrayMessage: {
            contacts: [
              { displayName: 'Bob', vcard: 'BEGIN:VCARD' },
              { displayName: 'Carol' },
            ],
          },
        },
      }),
    ).toEqual({
      ...common,
      type: 'contact',
      contacts: [{ name: 'Bob', vcard: 'BEGIN:VCARD', parsed: null }, { name: 'Carol', vcard: null, parsed: null }],
    })
    expect(
      normalizeWhatsappMessage('s', {
        ...base,
        message: { reactionMessage: { key: { id: 'target' }, text: '' } },
      }),
    ).toEqual({
      ...common,
      type: 'reaction',
      reaction: { messageId: 'target', emoji: '' },
    })
  })

  test('omits unavailable optional fields and does not expose unknown content', () => {
    expect(
      normalizeWhatsappMessage(
        's',
        { key: { fromMe: true }, message: { protocolMessage: { type: 0 } } },
        'self@lid',
      ),
    ).toEqual({
      id: null,
      chatId: null,
      remoteJid: null,
      lid: null,
      fromMe: true,
      isGroup: false,
      sender: { id: 'self@lid' },
      timestamp: null,
      type: 'unknown',
    })
    expect(
      normalizeWhatsappMessage('s', { key: {}, message: { imageMessage: {} } })
        .media,
    ).toEqual({})
  })
})

describe('event normalization helpers', () => {
  test.each([
    [
      {
        id: '1',
        remoteJid: '5511999:2@s.whatsapp.net',
        remoteJidAlt: '12345:3@lid',
        addressingMode: 'pn' as const,
      },
      '5511999:2@s.whatsapp.net',
      '5511999@s.whatsapp.net',
      '12345@lid',
    ],
    [
      {
        id: '1',
        remoteJid: '12345:3@lid',
        remoteJidAlt: '5511999:2@s.whatsapp.net',
        addressingMode: 'lid' as const,
      },
      '12345:3@lid',
      '5511999@s.whatsapp.net',
      '12345@lid',
    ],
    [
      { id: '1', remoteJid: '5511999@s.whatsapp.net' },
      '5511999@s.whatsapp.net',
      '5511999@s.whatsapp.net',
      null,
    ],
    [{ id: '1', remoteJid: '12345@lid' }, '12345@lid', null, '12345@lid'],
    [
      {
        id: '1',
        remoteJid: 'group@g.us',
        participant: '12345@lid',
        participantAlt: '5511999@s.whatsapp.net',
      },
      'group@g.us',
      null,
      null,
    ],
    [
      {
        id: '1',
        remoteJidAlt: '5511999@s.whatsapp.net',
        participantAlt: '12345@lid',
      },
      null,
      null,
      null,
    ],
  ])(
    'keeps raw chat ID and exposes only payload private identifiers',
    (key, chatId, remoteJid, lid) => {
      const before = structuredClone(key)
      const expected = { id: '1', chatId, remoteJid, lid, fromMe: false }
      expect(normalizeMessageReference(key)).toEqual(expected)
      const message = normalizeWhatsappMessage('s', {
        key,
        message: { conversation: 'hello' },
      })
      expect(message).toMatchObject({
        ...expected,
        sender: {
          id: ('participant' in key ? key.participant : undefined) ?? chatId,
        },
      })
      expect(key).toEqual(before)
    },
  )

  test('propagates both identifiers through update, reaction and receipt batches', () => {
    const key = {
      id: '1',
      remoteJid: '12345@lid',
      remoteJidAlt: '5511999@s.whatsapp.net',
      addressingMode: 'lid' as const,
    }
    const reference = {
      id: '1',
      chatId: '12345@lid',
      remoteJid: '5511999@s.whatsapp.net',
      lid: '12345@lid',
      fromMe: false,
    }
    expect(normalizeMessageUpdates([{ key, update: { status: 4 } }])).toEqual({
      messages: [{ ...reference, status: 'read' }],
    })
    expect(
      normalizeMessageReactions([{ key, reaction: { key: {}, text: '' } }]),
    ).toEqual({
      reactions: [
        {
          ...reference,
          sender: { id: null, fromMe: false },
          emoji: '',
          timestamp: null,
        },
      ],
    })
    expect(normalizeMessageReceipts([{ key, receipt: {} }])).toEqual({
      receipts: [
        {
          ...reference,
          recipientId: null,
          deliveredAt: null,
          readAt: null,
          playedAt: null,
        },
      ],
    })
  })

  test('converts timestamps and handles invalid and missing values', () => {
    expect(normalizeTimestamp(0)).toBe('1970-01-01T00:00:00.000Z')
    expect(normalizeTimestamp('1700000000')).toBe('2023-11-14T22:13:20.000Z')
    for (const value of [undefined, null, NaN, Infinity, 'invalid', 1e30])
      expect(normalizeTimestamp(value)).toBeNull()
  })
  test('maps all statuses including zero and omits unknown status', () => {
    expect([0, 1, 2, 3, 4, 5].map(normalizeMessageStatus)).toEqual([
      'error',
      'pending',
      'sent',
      'delivered',
      'read',
      'played',
    ])
    expect(normalizeMessageStatus(undefined)).toBeUndefined()
    expect(normalizeMessageStatus(99)).toBeUndefined()
    expect(normalizeMessageReference()).toEqual({
      id: null,
      chatId: null,
      remoteJid: null,
      lid: null,
      fromMe: false,
    })
  })
  test('normalizes batches of updates without leaking other update fields', () => {
    expect(
      normalizeMessageUpdates([
        { key, update: { status: 0, message: { conversation: 'private' } } },
        { key: {}, update: {} },
      ]),
    ).toEqual({
      messages: [
        { ...reference, status: 'error' },
        { id: null, chatId: null, remoteJid: null, lid: null, fromMe: false },
      ],
    })
  })
  test('normalizes reaction sender, removal and millisecond timestamps', () => {
    expect(
      normalizeMessageReactions(
        [
          {
            key,
            reaction: {
              key: { participant: 'bob@lid' },
              text: '👍',
              senderTimestampMs: 1700000000123,
            },
          },
          { key, reaction: { key: { fromMe: true }, text: '' } },
        ],
        'self@lid',
      ),
    ).toEqual({
      reactions: [
        {
          ...reference,
          sender: { id: 'bob@lid', fromMe: false },
          emoji: '👍',
          timestamp: '2023-11-14T22:13:20.123Z',
        },
        {
          ...reference,
          sender: { id: 'self@lid', fromMe: true },
          emoji: '',
          timestamp: null,
        },
      ],
    })
  })
  test('normalizes receipt timestamps and absent fields', () => {
    expect(
      normalizeMessageReceipts([
        {
          key,
          receipt: {
            userJid: 'bob@lid',
            receiptTimestamp: 1700000000,
            readTimestamp: 1700000001,
          },
        },
        { key: {}, receipt: {} },
      ]),
    ).toEqual({
      receipts: [
        {
          ...reference,
          recipientId: 'bob@lid',
          deliveredAt: '2023-11-14T22:13:20.000Z',
          readAt: '2023-11-14T22:13:21.000Z',
          playedAt: null,
        },
        {
          id: null,
          chatId: null,
          remoteJid: null,
          lid: null,
          fromMe: false,
          recipientId: null,
          deliveredAt: null,
          readAt: null,
          playedAt: null,
        },
      ],
    })
  })
})
