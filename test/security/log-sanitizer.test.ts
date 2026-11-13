import { expect, test } from 'bun:test'
import { createRedactingLogger } from '../../server/src/lib/log-sanitizer.ts'

test('all log levels and child bindings redact nested credentials, payloads, binary keys and URLs', () => {
  let output = ''
  const logger = createRedactingLogger({ level: 'trace' }, { write: chunk => { output += chunk } })
  const child = logger.child({ cookie: 'synthetic-cookie', extra: { apiKey: 'synthetic-api-key' } })
  const error = Object.assign(new Error('unlabelled-synthetic-secret'), {
    code: 'P2002', cause: new Error('synthetic-cause-secret'),
    config: { headers: { Authorization: 'synthetic-authorization' } },
  })
  for (const level of ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const) {
    child[level]({
      sessionId: 'session-test', err: error,
      extra: { password: 'synthetic-password', token: 'synthetic-token', qrCode: 'synthetic-qr',
        creds: { noiseKey: 'synthetic-noise' }, data: 'synthetic-payload',
        binary: Buffer.from('synthetic-binary'),
        url: 'https://user:synthetic-url-pass@example.com/private-secret?key=synthetic-query#synthetic-fragment',
        nested: [{ headers: { 'x-api-key': 'synthetic-header' }, error: 'synthetic-error-string' }],
      },
    }, 'Operation failed')
  }
  child.error(error, 'Error without details')
  child.info('Bearer synthetic-bearer zappaz_synthetic_key password=synthetic-inline https://user:pass@example.com/private?secret=synthetic-query')
  expect(output).not.toContain('synthetic')
  expect(output).not.toContain('private-secret')
  expect(output).toContain('session-test')
  expect(output).toContain('P2002')
  expect(output).toContain('Operation failed')
  expect(output).toContain('[REDACTED]')
  expect(output.trim().split('\n')).toHaveLength(8)
})

test('cyclic structures and nested errors cannot bypass redaction or crash logging', () => {
  let output = ''
  const logger = createRedactingLogger({}, { write: chunk => { output += chunk } })
  const cycle: { self?: unknown; password: string } = { password: 'synthetic-cycle' }
  cycle.self = cycle
  logger.info({ nested: cycle, error: { message: 'synthetic-error', stack: 'synthetic-stack' } })
  expect(output).not.toContain('synthetic')
  expect(() => JSON.parse(output)).not.toThrow()
})
