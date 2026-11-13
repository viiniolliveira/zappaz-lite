import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageBubble from '../../src/components/chat/message-bubble.tsx'
import { mockMessage } from './mock-data.ts'

const conversationId = '22222222-2222-4222-8222-222222222222'
const render = (overrides: Parameters<typeof mockMessage>[2]) =>
  renderToStaticMarkup(
    createElement(MessageBubble, { message: mockMessage(600, conversationId, overrides) }),
  )

describe('reported message cards', () => {
  test('renders sectioned lists with readable descriptions and text-reply actions', () => {
    const html = render({
      text: 'Escolha',
      interactive: {
        title: null,
        footer: null,
        buttons: [],
        list: {
          buttonText: 'Menu',
          sections: [
            {
              title: 'Serviços',
              rows: [
                {
                  id: 'GuiaeAutorização',
                  title: 'Guia e Autorização',
                  description: 'Solicite sua guia',
                },
              ],
            },
          ],
        },
      },
    })
    expect(html).toContain('message-list')
    expect(html).toContain('<details')
    expect(html).toContain('Serviços')
    expect(html).toContain('Solicite sua guia')
    expect(html).toContain('Guia e Autorização')
    expect(html).toContain('A opção será enviada como texto')
    expect(html.match(/data-slot="message-metadata"/g)).toHaveLength(1)
  })

  test('renders poll results and own selection without a fake voting action', () => {
    const html = render({
      type: 'poll',
      text: 'Jantar?',
      poll: {
        name: 'Jantar?',
        selectableOptionsCount: 0,
        options: [
          { name: 'Pizza', hash: 'pizza', votes: 1 },
          { name: 'Sushi', hash: 'sushi', votes: 0 },
        ],
        votes: [{ voterId: 'own@lid', fromMe: true, selectedOptions: ['pizza'], timestamp: null }],
      },
    })
    expect(html).toContain('message-poll')
    expect(html).toContain('Jantar?')
    expect(html).toContain('Pizza')
    expect(html).toContain('Sushi')
    expect(html).toContain('Sua escolha')
    expect(html).toContain('1 participante')
    expect(html).toContain('Para votar, use o WhatsApp')
    expect(html).toContain('value="1"')
  })

  test('hides album notices regardless of counts or deletion status', () => {
    for (const album of [
      { expectedImageCount: 6, expectedVideoCount: 2 },
      { expectedImageCount: 0, expectedVideoCount: 0 },
    ]) {
      expect(
        render({
          type: 'album',
          text: 'Álbum de mídia',
          album,
        }),
      ).toBe('')
    }
    expect(
      render({
        type: 'album',
        text: 'Álbum de mídia',
        album: { expectedImageCount: 0, expectedVideoCount: 0 },
        deletedAt: '2026-01-01T00:00:00.000Z',
      }),
    ).toBe('')
  })

  test('renders a private group invite without inventing a join link and honors expiration', () => {
    const groupInvite = {
      groupJid: 'group@g.us',
      name: 'Amigos',
      expiresAt: null,
      url: null,
      thumbnail: null,
    }
    const html = render({ type: 'group_invite', text: 'Convite', groupInvite })
    expect(html).toContain('message-group-invite')
    expect(html).toContain('Amigos')
    expect(html).toContain('Abra o WhatsApp')
    expect(html).not.toContain('chat.whatsapp.com')
    const link = render({
      type: 'group_invite',
      text: null,
      groupInvite: { ...groupInvite, url: 'https://chat.whatsapp.com/code' },
    })
    expect(link).toContain('href="https://chat.whatsapp.com/code"')
    expect(link).toContain('rel="noopener noreferrer"')
    const expired = render({
      type: 'group_invite',
      text: null,
      groupInvite: {
        ...groupInvite,
        url: 'https://chat.whatsapp.com/code',
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
    })
    expect(expired).toContain('Convite expirado')
    expect(expired).not.toContain('href="https://chat.whatsapp.com/code"')
  })

  test('renders unavailable content and system timers as notices, hiding them when deleted', () => {
    expect(
      render({
        type: 'unavailable',
        text: 'Mensagem indisponível neste dispositivo vinculado',
        unavailable: { reason: 'linked_device' },
      }),
    ).toContain('neste dispositivo vinculado')
    expect(
      render({
        type: 'system',
        text: 'Mensagens temporárias alteradas',
        system: { kind: 'disappearing_mode', duration: 7776000, blocked: null },
      }),
    ).toContain('90 dias')
    expect(
      render({
        type: 'system',
        text: 'Contato bloqueado',
        system: { kind: 'block_contact', duration: null, blocked: true },
      }),
    ).toContain('Contato bloqueado')
    const deleted = render({
      type: 'poll',
      text: 'Pergunta privada',
      poll: { name: 'Pergunta privada', selectableOptionsCount: 1, options: [], votes: [] },
      deletedAt: '2026-01-01T00:00:00.000Z',
    })
    expect(deleted).toContain('Mensagem removida')
    expect(deleted).not.toContain('Pergunta privada')
  })
})
