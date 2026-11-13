import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

for (const [fixture, mode, env] of [
  ['scheduler-fixture.ts', 'default', {}],
  [
    'scheduler-fixture.ts',
    'custom',
    { MESSAGE_RETENTION_DAYS: '7', WEBHOOK_LOG_RETENTION_DAYS: '3' },
  ],
  [
    'scheduler-fixture.ts',
    'off',
    { MESSAGE_RETENTION_DAYS: 'off', WEBHOOK_LOG_RETENTION_DAYS: 'off' },
  ],
  ['scheduler-fixture.ts', 'message-off', { MESSAGE_RETENTION_DAYS: 'off' }],
  ['scheduler-fixture.ts', 'webhook-off', { WEBHOOK_LOG_RETENTION_DAYS: 'off' }],
  ['worker-fixture.ts', '', {}],
] as Array<[string, string, Record<string, string>]>) {
  test(`${fixture}: ${mode || 'immediate run, overlap and stop'}`, async () => {
    const path = fileURLToPath(new URL(`./${fixture}`, import.meta.url))
    const proc = Bun.spawn(
      [
        process.execPath,
        '--no-env-file',
        '--tsconfig-override',
        fileURLToPath(new URL('../../server/tsconfig.json', import.meta.url)),
        path,
        mode,
      ],
      {
        cwd: '/tmp/opencode',
        env: { CLIENT_SECRET: 'test', DATABASE_URL: 'postgres://test', NODE_ENV: 'test', ...env },
        stdout: 'pipe',
        stderr: 'pipe',
      },
    )
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: '', stderr: '' })
  })
}
