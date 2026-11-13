import { describe, expect, test } from 'bun:test'
import {
  CreateGlobalWebhookBodySchema,
  UpdateGlobalWebhookBodySchema,
} from '../../server/src/modules/global-webhooks/schema.ts'
import {
  CreateWebhookBodySchema,
  UpdateWebhookBodySchema,
} from '../../server/src/modules/webhooks/schema.ts'

for (const [name, create, update] of [
  ['session', CreateWebhookBodySchema, UpdateWebhookBodySchema],
  ['global', CreateGlobalWebhookBodySchema, UpdateGlobalWebhookBodySchema],
] as const) {
  describe(`${name} webhook secret validation`, () => {
    for (const [action, schema, base] of [
      ['create', create, { url: 'https://example.com/webhook', events: {} }],
      ['update', update, {}],
    ] as const) {
      test(`${action} accepts omitted, null and nonempty secrets`, () => {
        expect(schema.parse(base)).not.toHaveProperty('secret')
        expect(schema.parse({ ...base, secret: null })).toHaveProperty('secret', null)
        expect(schema.parse({ ...base, secret: 'my-secret' })).toHaveProperty('secret', 'my-secret')
      })

      test(`${action} rejects empty and non-string secrets`, () => {
        for (const secret of ['', 123, false, {}]) {
          expect(schema.safeParse({ ...base, secret }).success).toBe(false)
        }
      })

      test(`${action} reserves the secret header regardless of case`, () => {
        for (const header of [
          'X-Zappaz-Webhook-Secret',
          'x-zappaz-webhook-secret',
          'X-ZAPPAZ-WEBHOOK-SECRET',
        ]) {
          expect(schema.safeParse({ ...base, headers: { [header]: 'override' } }).success).toBe(
            false,
          )
        }
        expect(schema.safeParse({ ...base, headers: { 'X-Custom': 'value' } }).success).toBe(true)
      })
    }
  })
}
