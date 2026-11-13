import { mock, test } from 'bun:test'
import assert from 'node:assert/strict'

let answers = [{ address: '8.8.8.8', family: 4 }]
const requests: unknown[] = []
mock.module('node:dns/promises', () => ({
  lookup: async (hostname: string, options: unknown) => {
    requests.push({ hostname, options })
    return answers
  },
}))

test('HTTPS and HTTP agents validate every DNS lookup, including rebinding', async () => {
  const { default: outbound } = await import('../../server/src/lib/axios-instance.ts')
  for (const agent of [outbound.defaults.httpsAgent, outbound.defaults.httpAgent]) {
    const lookup = agent.options.lookup
    assert.equal(typeof lookup, 'function')
    const resolve = () =>
      new Promise<string>((resolve, reject) => {
        lookup(
          'media.example.test',
          { family: 4, all: false },
          (error: Error | null, address: string) => {
            if (error) reject(error)
            else resolve(address)
          },
        )
      })
    answers = [{ address: '8.8.8.8', family: 4 }]
    assert.equal(await resolve(), '8.8.8.8')
    answers = [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]
    await assert.rejects(resolve(), /not permitted/i)
    answers = [{ address: '8.8.8.8', family: 4 }]
    assert.equal(await resolve(), '8.8.8.8')
    answers = [{ address: '127.0.0.1', family: 4 }]
    await assert.rejects(resolve(), /not permitted/i)
  }
  assert.equal(requests.length, 8)
  for (const request of requests) {
    assert.deepEqual(request, {
      hostname: 'media.example.test',
      options: { all: true, verbatim: true },
    })
  }
})
