import { expect, test } from 'bun:test'

test('post-sync enrichment updates only phones, paginates and isolates missing mappings and failures', async () => {
  const root = new URL('../../', import.meta.url).pathname
  const child = Bun.spawn([process.execPath, '--no-env-file', '--tsconfig-override', `${root}server/tsconfig.json`, `${root}test/whatsapp/contact-enrichment-fixture.ts`], {
    cwd: '/tmp/opencode', env: { PATH: process.env.PATH, NODE_ENV: 'test' }, stdout: 'pipe', stderr: 'pipe',
  })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect({ code, stdout, stderr }).toEqual({ code: 0, stdout: '', stderr: '' })
})
