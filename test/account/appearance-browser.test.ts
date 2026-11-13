import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = Bun.which('google-chrome') ?? (existsSync(macChrome) ? macChrome : null)

test.skipIf(!chrome)(
  'account appearance loads static themes, persists selection, restores modes and handles CSS failures',
  async () => {
    if (!chrome) throw new Error('Chrome required')
    const dir = await mkdtemp(join(tmpdir(), 'appearance-'))
    const build = await Bun.build({
      entrypoints: ['./test/account/appearance-browser-fixture.tsx'],
      target: 'browser',
    })
    expect(build.success).toBe(true)
    const script = await build.outputs[0].text()
    const catalog = await Bun.file('public/themes/themes.json').json()
    const server = Bun.serve({
      port: 0,
      hostname: '127.0.0.1',
      async fetch(req) {
        const path = new URL(req.url).pathname
        if (path === '/')
          return new Response(
            `<html><head><meta charset="UTF-8"><style>:root { --primary: red; }</style></head><body><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`,
            { headers: { 'content-type': 'text/html; charset=utf-8' } },
          )
        if (path === '/themes/themes.json')
          return Response.json([
            ...catalog,
            {
              id: 'missing',
              name: 'Indisponível',
              file: '/themes/missing.css',
              preview: catalog[0].preview,
            },
          ])
        const theme = catalog.find((item: { file: string }) => item.file === path)
        if (theme)
          return new Response(Bun.file(`public${theme.file}`), {
            headers: { 'content-type': 'text/css' },
          })
        return new Response('Not found', { status: 404 })
      },
    })
    try {
      const browser = Bun.spawn(
        [
          chrome,
          '--headless',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-background-networking',
          '--no-proxy-server',
          `--user-data-dir=${join(dir, 'profile')}`,
          '--virtual-time-budget=20000',
          '--dump-dom',
          server.url.href,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      const [output, errors, code] = await Promise.all([
        new Response(browser.stdout).text(),
        new Response(browser.stderr).text(),
        browser.exited,
      ])
      expect({ code, errors: code ? errors : '' }).toEqual({ code: 0, errors: '' })
      const match = output.match(/<body\b[^>]*>(.*?)<\/body>/s)
      if (!match?.[1]?.startsWith('['))
        throw new Error(`Missing browser results: ${output.slice(-6000)}\n${errors}`)
      const results = JSON.parse(match[1]) as { name: string; ok: boolean; error?: string }[]
      expect(results.filter((result) => !result.ok)).toEqual([])
      expect(results).toHaveLength(6)
    } finally {
      server.stop(true)
      await rm(dir, { recursive: true, force: true })
    }
  },
  60000,
)
