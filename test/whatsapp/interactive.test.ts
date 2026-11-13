import { describe, expect, test } from 'bun:test'
import type { WAProto } from 'baileys'
import { normalizeWhatsappMessage } from '../../server/src/lib/whatsapp-event-normalizer.ts'
import { interactiveContent } from '../../server/src/lib/whatsapp-interactive.ts'

function normalize(message: WAProto.IMessage) {
  return normalizeWhatsappMessage('session', { key: { id: 'message', remoteJid: '0@s.whatsapp.net' }, message })
}

describe('interactive WhatsApp messages', () => {
  const paymentParams = {
    reference_id: 'ref-sintetica', currency: 'BRL', total_amount: { value: 1500, offset: 100 },
    order: { items: [{ name: 'Recarga', quantity: 1 }] },
    payment_settings: [{ type: 'pix_dynamic_code', pix_dynamic_code: { code: 'PIX-SINTETICO', key: 'chave-privada', merchant_name: 'comerciante-privado' } }],
  }
  const payment = { referenceId: 'ref-sintetica', currency: 'BRL', totalAmount: { value: 1500, offset: 100 }, items: [{ name: 'Recarga', quantity: 1 }], pixCode: 'PIX-SINTETICO' }
  function review(json: string, extra: Array<{ name: string, buttonParamsJson: string }> = []): WAProto.IMessage {
    return { interactiveMessage: { body: { text: 'Pagamento' }, footer: { text: 'Rodapé' }, nativeFlowMessage: { buttons: [
      { name: 'review_and_pay', buttonParamsJson: json }, ...extra,
    ] } } }
  }

  test('normalizes PIX review without leaking extra payment fields and keeps other actions', () => {
    const message = review(JSON.stringify(paymentParams), [
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Sim', id: 'yes' }) },
      { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Abrir', url: 'https://example.invalid/' }) },
    ])
    const original = structuredClone(message)
    const result = normalize(message)
    expect(result).toMatchObject({ type: 'text', text: 'Pagamento', interactive: { footer: 'Rodapé', payment, buttons: [
      { kind: 'reply', text: 'Sim', id: 'yes', url: null },
      { kind: 'url', text: 'Abrir', id: null, url: 'https://example.invalid/' },
    ] } })
    expect(JSON.stringify(result.interactive)).not.toContain('chave-privada')
    expect(JSON.stringify(result.interactive)).not.toContain('comerciante-privado')
    expect(message).toEqual(original)
  })

  test.each([1, 1000])('preserves payment offset %i', offset => {
    const result = normalize(review(JSON.stringify({ ...paymentParams, total_amount: { value: 1500, offset } })))
    expect(result.interactive).toMatchObject({ payment: { ...payment, totalAmount: { value: 1500, offset } }, buttons: [] })
  })

  test.each([
    ['invalid JSON', '{'],
    ['missing reference', JSON.stringify({ ...paymentParams, reference_id: null })],
    ['lowercase currency', JSON.stringify({ ...paymentParams, currency: 'brl' })],
    ['short currency', JSON.stringify({ ...paymentParams, currency: 'BR' })],
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(value => [`invalid value ${value}`, JSON.stringify({ ...paymentParams, total_amount: { value, offset: 100 } })]),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(offset => [`invalid offset ${offset}`, JSON.stringify({ ...paymentParams, total_amount: { value: 1500, offset } })]),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(quantity => [`invalid quantity ${quantity}`, JSON.stringify({ ...paymentParams, order: { items: [{ name: 'Recarga', quantity }] } })]),
    ['invalid item', JSON.stringify({ ...paymentParams, order: { items: [{ name: null, quantity: 1 }] } })],
    ['missing items', JSON.stringify({ ...paymentParams, order: {} })],
    ['empty PIX code', JSON.stringify({ ...paymentParams, payment_settings: [{ type: 'pix_dynamic_code', pix_dynamic_code: { code: '' } }] })],
    ['non-PIX payment', JSON.stringify({ ...paymentParams, payment_settings: [{ type: 'credit_card' }] })],
    ['missing payment settings', JSON.stringify({ ...paymentParams, payment_settings: [] })],
  ])('marks %s as unsupported without a payment', (_label, json) => {
    const result = normalize(review(json))
    expect(result).toMatchObject({ type: 'text', text: 'Pagamento', interactive: { footer: 'Rodapé', buttons: [{ kind: 'unsupported' }] } })
    expect(result.interactive).not.toHaveProperty('payment')
  })
  test.each(['hydratedTemplate', 'hydratedFourRowTemplate'] as const)('normalizes %s text and buttons', field => {
    const result = normalize({ templateMessage: { [field]: {
      hydratedTitleText: 'Título', hydratedContentText: 'Corpo', hydratedFooterText: 'Rodapé',
      hydratedButtons: [
        { urlButton: { displayText: 'Abrir', url: 'https://example.invalid/path' } },
        { quickReplyButton: { displayText: 'Sim', id: 'yes' } },
        { callButton: { displayText: 'Ligar', phoneNumber: '123' } },
        { urlButton: { displayText: 'Inseguro', url: 'javascript:alert(1)' } },
      ],
    } } })
    expect(result).toMatchObject({ type: 'text', text: 'Corpo', chatId: '0@s.whatsapp.net', interactive: {
      title: 'Título', footer: 'Rodapé', buttons: [
        { kind: 'url', text: 'Abrir', id: null, url: 'https://example.invalid/path' },
        { kind: 'reply', text: 'Sim', id: 'yes', url: null },
        { kind: 'unsupported', text: 'Ligar', id: null, url: null },
        { kind: 'unsupported', text: 'Inseguro', id: null, url: null },
      ],
    } })
  })

  test('handles native buttons, invalid JSON and unsafe URLs without throwing', () => {
    const result = normalize({ interactiveMessage: { header: { title: 'Cabeçalho' }, body: { text: 'Escolha' }, footer: { text: 'Fim' }, nativeFlowMessage: { buttons: [
      { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Abrir', url: 'http://example.invalid/' }) },
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Sim', id: 'yes' }) },
      { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Inseguro', url: 'file:///secret' }) },
      { name: 'quick_reply', buttonParamsJson: '{' },
    ] } } })
    expect(result).toMatchObject({ type: 'text', text: 'Escolha', interactive: { title: 'Cabeçalho', footer: 'Fim', buttons: [
      { kind: 'url', text: 'Abrir', url: 'http://example.invalid/' },
      { kind: 'reply', text: 'Sim', id: 'yes', url: null },
      { kind: 'unsupported', text: 'Inseguro', url: null },
      { kind: 'unsupported', url: null },
    ] } })
  })

  test('retains unknown for an unsupported empty interactive format', () => {
    expect(normalize({ interactiveMessage: {} })).toMatchObject({ type: 'unknown' })
    expect(normalize({ interactiveMessage: {} }).interactive).toBeUndefined()
  })

  test.each(['image', 'video'] as const)('unwraps %s headers for the media pipeline', kind => {
    const media = kind === 'image' ? { imageMessage: { mimetype: 'image/jpeg' } } : { videoMessage: { mimetype: 'video/mp4', staticUrl: 'https://example.invalid/video' } }
    const message: WAProto.IMessage = { interactiveMessage: { header: media, body: { text: 'Legenda' } } }
    expect(normalize(message)).toMatchObject({ type: kind, text: 'Legenda', media: { mimeType: kind === 'image' ? 'image/jpeg' : 'video/mp4' } })
    if (kind === 'video') expect(interactiveContent(message).videoMessage?.url).toBe('https://example.invalid/video')
    else expect(interactiveContent(message).imageMessage?.mimetype).toBe('image/jpeg')
  })
})
