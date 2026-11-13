import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('./config-fixture.ts', import.meta.url))
async function run(env: Record<string, string> = {}) {
  const proc = Bun.spawn([process.execPath, '--no-env-file', fixture], {
    cwd: '/tmp/opencode',
    env: { CLIENT_SECRET: 'test', DATABASE_URL: 'postgres://test', NODE_ENV: 'test', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  return { code, stdout, stderr }
}

describe('retention configuration', () => {
  test('defaults, custom values and off are independent', async () => {
    for (const [env, expected] of [
      [{}, [90, 1]],
      [{ MESSAGE_RETENTION_DAYS: '7', WEBHOOK_LOG_RETENTION_DAYS: '12' }, [7, 12]],
      [{ MESSAGE_RETENTION_DAYS: 'off', WEBHOOK_LOG_RETENTION_DAYS: '2' }, [null, 2]],
      [{ MESSAGE_RETENTION_DAYS: '1', WEBHOOK_LOG_RETENTION_DAYS: 'off' }, [1, null]],
    ] as Array<[Record<string, string>, Array<number | null>]>) {
      const result = await run(env)
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual(expected)
    }
  })
  for (const name of ['MESSAGE_RETENTION_DAYS', 'WEBHOOK_LOG_RETENTION_DAYS']) {
    for (const value of [
      '',
      '0',
      '-1',
      '1.5',
      'foo',
      'OFF',
      '01',
      ' 1',
      '9007199254740992',
      '1000000000',
    ]) {
      test(`rejects ${name}=${JSON.stringify(value)}`, async () => {
        const result = await run({ [name]: value })
        expect(result.code).not.toBe(0)
        expect(result.stderr).toContain(name)
      })
    }
  }
})
