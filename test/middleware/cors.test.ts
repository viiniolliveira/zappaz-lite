import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test.each(['test', 'production'])('CORS uses application origins in %s', async (mode) => {
  const fixture = fileURLToPath(new URL('./cors-fixture.ts', import.meta.url))
  const child = Bun.spawn([process.execPath, '--no-env-file', fixture], {
    cwd: '/tmp/opencode', env: { PATH: Bun.env.PATH, HOME: '/tmp/opencode', NODE_ENV: mode, APP_URL: 'https://app.example', CLIENT_SECRET: 'a7E2k9Lm4Nq8Rs5Tv3Wx6Yz1Bc0Df2Gh', DATABASE_URL: 'postgresql://unused/unused' }, stdout: 'pipe', stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited])
  expect({ exitCode, stdout: exitCode ? stdout : '', stderr: exitCode ? stderr : '' }).toEqual({ exitCode: 0, stdout: '', stderr: '' })
})
