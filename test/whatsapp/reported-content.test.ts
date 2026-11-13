import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { proto, WAMessageStubType, type WAProto } from 'baileys'
import sharp from 'sharp'
import {
  normalizeMessageReceipts,
  normalizeMessageUpdates,
  normalizeWhatsappMessage,
  normalizeWhatsappMessageWithThumbnails,
} from '../../server/src/lib/whatsapp-event-normalizer.ts'
import { interactiveContent } from '../../server/src/lib/whatsapp-interactive.ts'
import { applyPollVotes } from '../../server/src/lib/whatsapp-poll.ts'

const key = { id: 'sample', remoteJid: '123@lid', fromMe: false }
const envelope = (message: WAProto.IMessage): WAProto.IWebMessageInfo => ({ key, message })
const normalize = (message: WAProto.IMessage) =>
  normalizeWhatsappMessage('session', envelope(message))

describe('reported WhatsApp content', () => {
  test('reads nested templates, including body-only native flows and no buttons', () => {
    for (const nativeFlowMessage of [undefined, { messageParamsJson: '{}' }]) {
      expect(
        normalize({
          templateMessage: {
            interactiveMessageTemplate: { body: { text: 'Pedido chegou' }, nativeFlowMessage },
          },
        }),
      ).toMatchObject({
        type: 'text',
        text: 'Pedido chegou',
        interactive: { title: null, footer: null, buttons: [] },
      })
    }
  })

  test('preserves nested title, footer, quick replies, URL and template context without leaking metadata', () => {
    const content: WAProto.IMessage = {
      templateMessage: {
        templateId: 'template',
        interactiveMessageTemplate: {
          header: { title: 'Título' },
          body: { text: 'Corpo' },
          footer: { text: 'Fim' },
          nativeFlowMessage: {
            buttons: [
              {
                name: 'cta_url',
                buttonParamsJson: JSON.stringify({
                  display_text: 'Abrir',
                  url: 'https://example.invalid/',
                  landing_page_url: 'javascript:alert(1)',
                  payment_metadata: {},
                }),
              },
              {
                name: 'quick_reply',
                buttonParamsJson: JSON.stringify({ display_text: 'Sim', id: 'yes' }),
              },
            ],
          },
          contextInfo: {
            stanzaId: 'quote',
            mentionedJid: ['456@lid'],
            quotedMessage: { conversation: 'Antes' },
          },
        },
      },
    }
    const result = normalize(content)
    expect(result).toMatchObject({
      type: 'text',
      text: 'Corpo',
      interactive: {
        title: 'Título',
        footer: 'Fim',
        buttons: [
          { kind: 'url', url: 'https://example.invalid/' },
          { kind: 'reply', id: 'yes' },
        ],
      },
      replyTo: { id: 'quote', text: 'Antes' },
      mentions: ['456@lid'],
    })
    expect(JSON.stringify(result)).not.toContain('payment_metadata')
    expect(JSON.stringify(result)).not.toContain('landing_page_url')
  })

  test('uses the same nested media for normalization, thumbnails, downloads and quoted previews', async () => {
    const jpeg = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#abc' } })
      .jpeg()
      .toBuffer()
    const content: WAProto.IMessage = {
      templateMessage: {
        interactiveMessageTemplate: {
          header: {
            imageMessage: {
              mimetype: 'image/jpeg',
              jpegThumbnail: jpeg,
              fileLength: 123,
              url: 'https://example.invalid/encrypted',
            },
          },
          body: { text: 'Legenda' },
        },
      },
    }
    expect(interactiveContent(content).imageMessage?.url).toBe('https://example.invalid/encrypted')
    const result = await normalizeWhatsappMessageWithThumbnails('session', envelope(content))
    expect(result).toMatchObject({
      type: 'image',
      text: 'Legenda',
      media: {
        size: 123,
        downloadPath: '/api/v1/session/session/message/sample/media/base64',
        thumbnail: { base64: jpeg.toString('base64'), width: 3, height: 2 },
      },
    })
    const quote = await normalizeWhatsappMessageWithThumbnails(
      'session',
      envelope({
        buttonsResponseMessage: {
          selectedDisplayText: 'Sim',
          selectedButtonId: 'yes',
          contextInfo: { stanzaId: 'original', participant: '456@lid', quotedMessage: content },
        },
      }),
    )
    expect(quote).toMatchObject({
      type: 'text',
      text: 'Sim',
      selection: { kind: 'button', id: 'yes' },
      replyTo: {
        id: 'original',
        senderId: '456@lid',
        type: 'image',
        text: 'Legenda',
        media: { thumbnail: { base64: jpeg.toString('base64') } },
      },
    })
    expect(quote.replyTo?.media?.downloadPath).toBeUndefined()
  })

  test('preserves button labels and IDs and list sections without conflating their identifiers', () => {
    const buttons = normalize({
      buttonsMessage: {
        contentText: 'Escolha',
        buttons: [{ buttonId: 'Ambosperíodos', buttonText: { displayText: 'Ambos períodos' } }],
      },
    })
    expect(buttons).toMatchObject({
      type: 'text',
      text: 'Escolha',
      interactive: { buttons: [{ kind: 'reply', id: 'Ambosperíodos', text: 'Ambos períodos' }] },
    })
    const list: WAProto.IMessage = {
      listMessage: {
        buttonText: 'Menu',
        description: 'Escolha uma opção',
        sections: [
          {
            title: 'Serviços',
            rows: [
              {
                rowId: 'GuiaeAutorização',
                title: 'Guia e Autorização',
                description: 'Solicitar guia',
              },
            ],
          },
        ],
      },
    }
    expect(normalize(list)).toMatchObject({
      type: 'text',
      text: 'Escolha uma opção',
      interactive: {
        list: {
          buttonText: 'Menu',
          sections: [
            {
              title: 'Serviços',
              rows: [
                {
                  id: 'GuiaeAutorização',
                  title: 'Guia e Autorização',
                  description: 'Solicitar guia',
                },
              ],
            },
          ],
        },
      },
    })
    expect(
      normalize({
        listResponseMessage: {
          title: 'Guia e Autorização',
          singleSelectReply: { selectedRowId: 'GuiaeAutorização' },
          contextInfo: { stanzaId: 'menu', quotedMessage: list },
        },
      }),
    ).toMatchObject({
      type: 'text',
      text: 'Guia e Autorização',
      selection: { kind: 'list', id: 'GuiaeAutorização' },
      replyTo: {
        id: 'menu',
        type: 'text',
        text: 'Escolha uma opção',
        interactive: { list: { buttonText: 'Menu' } },
      },
    })
  })

  test.each([
    0, 2, 6,
  ])('recognizes album counts (%s) without inventing downloadable media', (count) => {
    const result = normalize({ albumMessage: { expectedImageCount: count, expectedVideoCount: 0 } })
    expect(result).toMatchObject({
      type: 'album',
      album: { expectedImageCount: count, expectedVideoCount: 0 },
    })
    expect(result.media).toBeUndefined()
  })

  test('recognizes missing and masked content but preserves genuinely unknown payloads', () => {
    expect(normalizeWhatsappMessage('session', { key }).unavailable?.reason).toBe('missing_content')
    expect(
      normalize({
        placeholderMessage: {
          type: proto.Message.PlaceholderMessage.PlaceholderType.MASK_LINKED_DEVICES,
        },
      }).unavailable?.reason,
    ).toBe('linked_device')
    expect(normalize({ protocolMessage: {} }).type).toBe('unknown')
    expect(normalizeWhatsappMessage('session', { key, messageStubType: 9999 }).type).toBe('unknown')
  })

  test('normalizes timer changes, zero duration and explicit block/unblock notices', () => {
    for (const duration of ['0', '604800', '7776000']) {
      expect(
        normalizeWhatsappMessage('session', {
          key,
          messageStubType: WAMessageStubType.DISAPPEARING_MODE,
          messageStubParameters: [duration, key.remoteJid],
        }),
      ).toMatchObject({
        type: 'system',
        system: { kind: 'disappearing_mode', duration: Number(duration), blocked: null },
      })
    }
    for (const blocked of ['true', 'false'])
      expect(
        normalizeWhatsappMessage('session', {
          key,
          messageStubType: WAMessageStubType.BLOCK_CONTACT,
          messageStubParameters: [blocked],
        }).system?.blocked,
      ).toBe(blocked === 'true')
  })

  test('normalizes a group invite in a private chat without fabricating an invite code', async () => {
    const jpeg = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#abc' } })
      .jpeg()
      .toBuffer()
    const invite = await normalizeWhatsappMessageWithThumbnails(
      'session',
      envelope({
        groupInviteMessage: {
          groupJid: '123@g.us',
          groupName: 'Grupo',
          caption: 'Convite',
          inviteExpiration: 1764797517,
          jpegThumbnail: jpeg,
        },
      }),
    )
    expect(invite).toMatchObject({
      type: 'group_invite',
      isGroup: false,
      chatId: '123@lid',
      groupInvite: {
        groupJid: '123@g.us',
        name: 'Grupo',
        url: null,
        thumbnail: { base64: jpeg.toString('base64') },
      },
    })
    expect(normalize({ groupInviteMessage: { inviteCode: 'safeCode' } }).groupInvite?.url).toBe(
      'https://chat.whatsapp.com/safeCode',
    )
    expect(
      normalize({ groupInviteMessage: { inviteCode: '../unsafe' } }).groupInvite?.url,
    ).toBeNull()
  })

  test('keeps final location, including zero coordinates', () => {
    expect(
      normalizeWhatsappMessage('session', {
        key,
        duration: 3600,
        finalLiveLocation: { degreesLatitude: 0, degreesLongitude: -46.8, timeOffset: 3544 },
      }),
    ).toMatchObject({ type: 'location', location: { latitude: 0, longitude: -46.8 } })
  })

  test('preserves history reactions and receipts without treating zero timestamps as read', () => {
    const result = normalizeWhatsappMessage(
      'session',
      {
        ...envelope({ albumMessage: {} }),
        reactions: [{ key: { fromMe: true }, text: '👍', senderTimestampMs: 1700000000000 }],
        userReceipt: [
          {
            userJid: '456@lid',
            receiptTimestamp: 1700000000,
            readTimestamp: 0,
            playedTimestamp: 0,
          },
        ],
      },
      'own@lid',
    )
    expect(result.reactions).toEqual([
      { senderJid: 'own@lid', fromMe: true, emoji: '👍', timestamp: '2023-11-14T22:13:20.000Z' },
    ])
    expect(result.receipts?.[0]).toMatchObject({
      recipientId: '456@lid',
      deliveredAt: '2023-11-14T22:13:20.000Z',
      readAt: null,
      playedAt: null,
    })
    expect(
      normalizeMessageReceipts([{ key, receipt: { readTimestamp: 0 } }]).receipts[0].readAt,
    ).toBeNull()
  })
})

describe('poll history and realtime votes', () => {
  const hash = (text: string) => createHash('sha256').update(text).digest()
  test.each([
    'pollCreationMessage',
    'pollCreationMessageV2',
    'pollCreationMessageV3',
  ] as const)('normalizes %s and aggregates the current vote per author', (field) => {
    const message = envelope({
      [field]: {
        name: 'Jantar?',
        options: [{ optionName: 'Pizza' }, { optionName: 'Sushi' }],
        selectableOptionsCount: 0,
      },
    })
    const result = normalizeWhatsappMessage(
      'session',
      {
        ...message,
        pollUpdates: [
          {
            pollUpdateMessageKey: { fromMe: true },
            senderTimestampMs: 1700000000000,
            vote: { selectedOptions: [hash('Pizza')] },
          },
          {
            pollUpdateMessageKey: { fromMe: true },
            senderTimestampMs: 1700000001000,
            vote: { selectedOptions: [hash('Sushi')] },
          },
        ],
      },
      'own@lid',
    )
    expect(result.type).toBe('poll')
    expect(result.poll?.options.map((option) => option.votes)).toEqual([0, 1])
    expect(result.poll?.votes).toHaveLength(1)
    const poll = result.poll
    if (!poll) throw new Error('Expected normalized poll')
    expect(
      applyPollVotes(poll, [
        { ...poll.votes[0], selectedOptions: [], timestamp: '2023-11-14T22:13:22.000Z' },
      ]).options.map((option) => option.votes),
    ).toEqual([0, 0])
    expect(
      applyPollVotes(poll, [
        { ...poll.votes[0], selectedOptions: [], timestamp: '2023-11-14T22:13:19.000Z' },
      ]),
    ).toEqual(poll)
  })

  test('exposes normalized votes and final locations in message updates', () => {
    const update = normalizeMessageUpdates(
      [
        {
          key,
          update: {
            pollUpdates: [
              {
                pollUpdateMessageKey: { fromMe: true },
                vote: { selectedOptions: [hash('Pizza')] },
              },
            ],
            finalLiveLocation: { degreesLatitude: 0, degreesLongitude: 0 },
          },
        },
      ],
      'own@lid',
    ).messages[0]
    expect(update).toMatchObject({
      location: { latitude: 0, longitude: 0 },
      pollVotes: [{ voterId: 'own@lid', selectedOptions: [hash('Pizza').toString('base64')] }],
    })
  })
})
