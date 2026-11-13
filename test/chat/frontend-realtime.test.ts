import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixture = fileURLToPath(new URL('./frontend-realtime-fixture.ts', import.meta.url))

describe('frontend realtime chat in an isolated runtime', () => {
  for (const [scenario, description] of [
    ['subscription', 'subscribes before loading snapshots and resubscribes on reconnect'],
    [
      'presence-subscription',
      'subscribes to the opened conversation presence and renews after reconnections without sending typing',
    ],
    ['late-ack', 'ignores subscription acknowledgements from a disconnected socket'],
    ['errors', 'does not acknowledge timed out or invalid subscriptions'],
    ['events', 'keeps the newest revision and rejects duplicate or out-of-scope events'],
    [
      'typing',
      'expires received typing after five seconds and clears it on incoming messages and cleanup',
    ],
    [
      'visibility',
      'hides empty and pruned conversations until a persisted message snapshot arrives',
    ],
    ['deleted', 'applies scoped deletion events and ignores late updates'],
    ['forbidden', 'clears session data and blocks reconnect after access is forbidden'],
    [
      'rate-limit-retry',
      'retries a temporary handshake limit once without discarding chat state and cancels on disposal',
    ],
    [
      'unauthorized-handshake',
      'clears private state and blocks retries on an unauthorized handshake',
    ],
    [
      'resync-pages',
      'reconciles loaded pages with a trailing refresh and preserves drafts, optimistic messages and deletions',
    ],
    ['resync-global', 'coalesces global reconciliation without cancelling an in-flight request'],
    [
      'resync-logs',
      'refreshes the bounded log snapshot and first page without refetching historical pages',
    ],
    ['cleanup', 'unsubscribes and removes socket and browser listeners on unmount'],
  ]) {
    test(description, async () => {
      const child = Bun.spawn(
        [
          process.execPath,
          '--no-env-file',
          '--tsconfig-override',
          `${root}tsconfig.app.json`,
          fixture,
          scenario,
        ],
        {
          cwd: '/tmp/opencode',
          env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', NODE_ENV: 'test' },
          stdout: 'pipe',
          stderr: 'pipe',
        },
      )
      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({
        exitCode: 0,
        stdout: '',
        stderr: '',
      })
    })
  }
})
