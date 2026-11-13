import { describe, expect, test } from 'bun:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MessagePayment from '../../src/components/chat/messages/message-payment.tsx'

const payment = {
  referenceId: 'ref-sintetica', currency: 'BRL', totalAmount: { value: 1500, offset: 100 },
  items: [{ name: 'Recarga', quantity: 1 }, { name: 'Pacote', quantity: 3 }], pixCode: 'PIX-SINTETICO-PRIVADO',
}

describe('payment message card', () => {
  test('renders payment details and composed content without exposing the PIX code', () => {
    const html = renderToStaticMarkup(createElement(MessagePayment, {
      payment, footer: 'Rodapé de teste', metadata: createElement('span', null, '12:34'),
      actions: createElement('span', null, 'Outra ação'), children: createElement('p', null, 'Corpo de teste'),
    }))
    for (const text of ['ref-sintetica', 'Recarga', 'Pacote', 'Quantidade: 1', 'Quantidade: 3', 'Pix', 'Corpo de teste', 'Rodapé de teste', '12:34', 'Outra ação']) {
      expect(html).toContain(text)
    }
    expect(html.replace(/\u00a0/g, ' ')).toContain('R$ 15,00')
    expect(html).not.toContain(payment.pixCode)
    expect(html.indexOf('12:34')).toBeLessThan(html.indexOf('<button'))
    expect(html.indexOf('Outra ação')).toBeGreaterThan(html.indexOf('</button>'))
    const button = html.match(/<button\b[^>]*>/)?.[0]
    expect(button).toContain('type="button"')
    expect(button).not.toMatch(/\sdisabled(?:="[^"]*")?(?:\s|>)/)
    expect(html).toContain('Copiar código Pix')
  })

  test.each([[1, 'R$ 1.500,00'], [1000, 'R$ 1,50']])('uses offset %i to format the total', (offset, total) => {
    const html = renderToStaticMarkup(createElement(MessagePayment, {
      payment: { ...payment, totalAmount: { value: 1500, offset } }, children: null,
    }))
    expect(html.replace(/\u00a0/g, ' ')).toContain(total)
  })

  test('disables the copy button when requested', () => {
    const html = renderToStaticMarkup(createElement(MessagePayment, { payment, children: null, disabled: true }))
    const button = html.match(/<button\b[^>]*>/)?.[0]
    expect(button).toContain('type="button"')
    expect(button).toMatch(/\sdisabled(?:="[^"]*")?(?:\s|>)/)
    expect(html).not.toContain(payment.pixCode)
  })
})
