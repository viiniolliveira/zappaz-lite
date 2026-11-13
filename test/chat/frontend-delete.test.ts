import { describe, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const fixture = fileURLToPath(new URL('./frontend-delete-fixture.ts', import.meta.url))
describe('frontend conversation deletion in an isolated runtime', () => {
  for (const [scenario, description] of [
    ['success', 'clears only the deleted conversation and rejects stale snapshots'],
    ['pending', 'warns when media cleanup is pending'],
    ['fail', 'preserves data and reports HTTP failure'],
    ['no-session', 'refuses to delete without a selected session'],
    ['foreign', 'keeps current session data when another session is deleted'],
  ]) test(description, async () => {
    const child = Bun.spawn([Bun.which('bun')!, '--no-env-file', '--tsconfig-override', `${root}tsconfig.app.json`, fixture, scenario], { cwd: '/tmp/opencode', env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', NODE_ENV: 'test' }, stdout: 'pipe', stderr: 'pipe' })
    const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
    expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
  })
})
