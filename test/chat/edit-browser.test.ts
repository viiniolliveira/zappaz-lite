import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome =
  Bun.which('google-chrome') ??
  Bun.which('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')
test.skipIf(!chrome)(
  'text edit menu, preview, validation, failure, submission and cache in a browser',
  async () => {
    if (!chrome) throw new Error('Chrome is required')
    const dir = await mkdtemp('/tmp/opencode/edit-dialog-')
    try {
      const build = await Bun.build({
        entrypoints: ['./test/chat/edit-browser-fixture.tsx'],
        target: 'browser',
        outdir: dir,
        naming: 'fixture.js',
      })
      expect(build.success).toBe(true)
      const script = await readFile(join(dir, 'fixture.js'), 'utf8')
      const html = join(dir, 'fixture.html')
      await writeFile(
        html,
        `<html><body><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`,
      )
      const browser = Bun.spawn(
        [
          chrome,
          '--headless',
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
      const body = output.match(/<body\b[^>]*>(.*?)<\/body>/s)?.[1]
      if (!body) throw new Error(`Missing browser results: ${output}`)
      const results = JSON.parse(body) as { name: string; ok: boolean; error?: string }[]
      expect(results).toHaveLength(9)
      expect(results.filter((result) => !result.ok)).toEqual([])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  30000,
)
