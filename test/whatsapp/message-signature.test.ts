import { describe, expect, test } from 'bun:test'
import { BadRequestError } from '../../server/src/common/errors/bad-request-error.ts'
import {
  CreateSessionConfigSchema,
  SignatureNameSchema,
  TextSignatureSchema,
  UpdateSessionConfigSchema,
} from '../../server/src/common/schema.ts'
import { signTextMessage } from '../../server/src/lib/message-signature.ts'
import { SendTextSchema } from '../../server/src/modules/conversation-messages/schema.ts'
import {
  CreateSessionBodySchema,
  UpdateSessionBodySchema,
} from '../../server/src/modules/sessions/schema.ts'
import { publicSession } from '../../server/src/modules/sessions/public-session.ts'
import { TextMessageSchema } from '../../server/src/modules/whatsapp-messages/schema.ts'

describe('message signatures', () => {
  const enabled = { signatureEnabled: true, signatureName: ' Alice ' }
  const disabled = { signatureEnabled: false, signatureName: ' Alice ' }

  test('inherits the session setting and allows per-message overrides', () => {
    expect(signTextMessage('hello\nworld', enabled)).toBe('*Alice:*\nhello\nworld')
    expect(signTextMessage('hello', disabled)).toBe('hello')
    expect(signTextMessage('hello', disabled, { signMessage: true })).toBe('*Alice:*\nhello')
    expect(signTextMessage('hello', enabled, { signMessage: false, signatureName: 'Bob' })).toBe(
      'hello',
    )
    expect(signTextMessage('hello', enabled, { signatureName: ' Bob ' })).toBe('*Bob:*\nhello')
    expect(signTextMessage('hello', disabled, { signatureName: 'Bob' })).toBe('hello')
  })

  test('requires a nonblank name only when signing', () => {
    const config = { signatureEnabled: true, signatureName: '  ' }
    expect(() => signTextMessage('hello', config)).toThrow(BadRequestError)
    expect(() => signTextMessage('hello', enabled, { signatureName: ' ' })).toThrow(BadRequestError)
    expect(signTextMessage('hello', config, { signMessage: false })).toBe('hello')
    expect(signTextMessage('hello', config, { signatureName: 'Bob' })).toBe('*Bob:*\nhello')
  })
})

describe('signature schemas', () => {
  test('config names are trimmed, single-line and at most 100 characters', () => {
    expect(SignatureNameSchema.parse('  Alice  ')).toBe('Alice')
    expect(SignatureNameSchema.parse('  ')).toBe('')
    expect(SignatureNameSchema.safeParse('a'.repeat(100)).success).toBe(true)
    for (const value of ['a'.repeat(101), 'a\nb', 'a\rb']) {
      expect(SignatureNameSchema.safeParse(value).success).toBe(false)
    }
  })

  test('message options require a nonblank valid name and boolean flag', () => {
    expect(TextSignatureSchema.parse({})).toEqual({})
    expect(TextSignatureSchema.parse({ signMessage: false, signatureName: ' Alice ' })).toEqual({
      signMessage: false,
      signatureName: 'Alice',
    })
    for (const options of [
      { signatureName: '  ' },
      { signatureName: 'a\nb' },
      { signatureName: 'x'.repeat(101) },
      { signMessage: 'true' },
    ]) {
      expect(TextSignatureSchema.safeParse(options).success).toBe(false)
    }
  })

  test('both text endpoints retain and validate signature options', () => {
    const schemas = [
      { schema: TextMessageSchema, body: { number: '123', message: 'hello' } },
      {
        schema: SendTextSchema,
        body: { text: 'hello', clientRequestId: '00000000-0000-4000-8000-000000000003' },
      },
    ]
    for (const { schema, body } of schemas) {
      expect(schema.parse({ ...body, signMessage: true, signatureName: ' Bob ' })).toMatchObject({
        signMessage: true,
        signatureName: 'Bob',
      })
      expect(schema.safeParse({ ...body, signatureName: ' ' }).success).toBe(false)
      expect(schema.safeParse({ ...body, signMessage: 1 }).success).toBe(false)
    }
  })

  test('session create defaults and partial updates preserve signature settings', () => {
    for (const config of [
      CreateSessionConfigSchema.parse({}),
      CreateSessionBodySchema.parse({ config: {} }).config,
    ]) {
      expect(config).toMatchObject({ signatureEnabled: false, signatureName: '' })
    }
    expect(UpdateSessionConfigSchema.parse({ signatureName: ' Bob ' })).toEqual({
      signatureName: 'Bob',
    })
    expect(UpdateSessionBodySchema.parse({ config: { signatureEnabled: true } })).toEqual({
      config: { signatureEnabled: true },
    })
    expect(UpdateSessionBodySchema.safeParse({ config: { signatureName: 'a\nb' } }).success).toBe(
      false,
    )
  })

  test('public session projects signature settings and handles missing config', () => {
    const date = new Date('2025-01-01T00:00:00Z')
    const config = {
      id: 'config',
      sessionId: 'session',
      createdAt: date,
      updatedAt: date,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      ignoreGroups: false,
      clientConnectionName: 'ZappaZ',
      rejectCalls: false,
      messageOnCall: null,
      signatureEnabled: true,
      signatureName: 'Alice',
    }
    const session = {
      id: 'session',
      status: null,
      createdAt: date,
      updatedAt: date,
      disconnectedAt: null,
      connectedAt: null,
      jid: null,
      enabled: true,
      userId: 'user',
      profilePictureUrl: null,
      displayName: null,
      archived: false,
      config,
    }
    expect(publicSession(session).config).toEqual({
      syncFullHistory: false,
      markOnlineOnConnect: false,
      ignoreGroups: false,
      clientConnectionName: 'ZappaZ',
      rejectCalls: false,
      messageOnCall: null,
      signatureEnabled: true,
      signatureName: 'Alice',
    })
    expect(publicSession({ ...session, config: null }).config).toBeNull()
  })
})
