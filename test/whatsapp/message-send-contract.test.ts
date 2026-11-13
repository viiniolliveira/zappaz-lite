import { describe, expect, test } from 'bun:test'
import * as common from '../../server/src/common/schema.ts'
import * as routes from '../../server/src/modules/whatsapp-messages/schema.ts'

describe('message send contract', () => {
  test('does not expose triggerEvent for any message type', () => {
    const schemas = [
      common.TextMessageSchema,
      common.MediaMessageSchema,
      common.ImageMessageSchema,
      common.VideoMessageSchema,
      common.AudioMessageSchema,
      common.DocumentMessageSchema,
      common.ContactMessageSchema,
      common.LocationMessageSchema,
      routes.TextMessageSchema,
      routes.ImageMessageSchema,
      routes.VideoMessageSchema,
      routes.AudioMessageSchema,
      routes.DocumentMessageSchema,
      routes.ContactMessageSchema,
      routes.LocationMessageSchema,
    ]

    for (const schema of schemas) {
      expect(schema.shape).not.toHaveProperty('triggerEvent')
    }
  })

  test('ignores triggerEvent supplied to the text request schema', () => {
    expect(
      routes.TextMessageSchema.parse({
        number: '5511999999999',
        message: 'hello',
        triggerEvent: false,
      }),
    ).toEqual({ number: '5511999999999', message: 'hello', linkPreview: true })
  })
})
