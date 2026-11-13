import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import { build as viteBuild } from 'vite'

const chrome = Bun.which('google-chrome')
test.skipIf(!chrome)(
  'webhook modal searches, selects, removes and submits events',
  async () => {
    if (!chrome) throw new Error('google-chrome is required')
    const dir = await mkdtemp('/tmp/opencode/webhook-events-')
    try {
      const build = await Bun.build({
        entrypoints: ['./test/webhooks/events-modal-browser-fixture.tsx'],
        target: 'browser',
        outdir: dir,
        naming: 'fixture.js',
      })
      expect(build.success).toBe(true)
      await viteBuild({
        configFile: false,
        logLevel: 'silent',
        plugins: [tailwindcss()],
        build: {
          outDir: join(dir, 'css'),
          emptyOutDir: true,
          rollupOptions: { input: './src/global.css', output: { assetFileNames: 'style.css' } },
        },
      })
      const css = await readFile(join(dir, 'css/style.css'), 'utf8')
      const script = await readFile(join(dir, 'fixture.js'), 'utf8')
      const html = join(dir, 'fixture.html')
      await writeFile(
        html,
        `<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`,
      )
      const browser = Bun.spawn(
        [
          chrome,
          '--headless',
          '--window-size=400,500',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-background-networking',
          '--no-proxy-server',
          '--virtual-time-budget=5000',
          '--dump-dom',
          `file://${html}`,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      const [output, errors, code] = await Promise.all([
        new Response(browser.stdout).text(),
        new Response(browser.stderr).text(),
        browser.exited,
      ])
      expect({ code, errors: code ? errors : '' }).toEqual({ code: 0, errors: '' })
      const match = output.match(/<body(?:\s[^>]*)?>(.*?)<\/body>/s)
      if (!match?.[1]) throw new Error(`Missing browser result: ${output} ${errors}`)
      const results = JSON.parse(match[1]) as { name: string; ok: boolean; error?: string }[]
      expect(results).toHaveLength(5)
      expect(results.filter((result) => !result.ok)).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  30000,
)
