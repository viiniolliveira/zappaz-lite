import { describe, expect, test } from 'bun:test'
import { InteractiveMessageSchema } from '../../server/src/lib/chat-contract.ts'
import { messageSchema } from '../../src/lib/chat/schemas.ts'

const payment = { referenceId: 'ref-sintetica', currency: 'BRL', totalAmount: { value: 1500, offset: 100 }, items: [{ name: 'Recarga', quantity: 1 }], pixCode: 'PIX-SINTETICO' }
const interactive = { title: null, footer: 'Rodapé', buttons: [], payment }

describe.each([['backend', InteractiveMessageSchema], ['frontend', messageSchema.shape.interactive]] as const)('%s interactive payment schema', (_name, schema) => {
  test('preserves the payment and accepts its absence', () => {
    expect(schema.parse(interactive)).toEqual(interactive)
    expect(schema.safeParse({ title: null, footer: null, buttons: [] }).success).toBe(true)
    expect(schema.safeParse({ ...interactive, payment: { ...payment, totalAmount: { value: 0, offset: 1 } } }).success).toBe(true)
  })

  test.each([
    { ...payment, referenceId: 123 }, { ...payment, currency: 'brl' }, { ...payment, currency: 'BR' },
    ...[-1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(value => ({ ...payment, totalAmount: { value, offset: 100 } })),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(offset => ({ ...payment, totalAmount: { value: 1500, offset } })),
    ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1].map(quantity => ({ ...payment, items: [{ name: 'Recarga', quantity }] })),
    { ...payment, items: [{ name: null, quantity: 1 }] }, { ...payment, pixCode: '' },
  ])('rejects invalid payment %#', invalid => {
    expect(schema.safeParse({ ...interactive, payment: invalid }).success).toBe(false)
  })
})
