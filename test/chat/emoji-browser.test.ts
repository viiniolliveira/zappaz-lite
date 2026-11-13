import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const chrome =
  Bun.which('google-chrome') ??
  Bun.which('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome')

test.skipIf(!chrome)(
  'emoji picker composer interactions in the browser',
  async () => {
    if (!chrome) throw new Error('google-chrome required')
    const dir = await mkdtemp(join(tmpdir(), 'emoji-picker-'))
    try {
      const build = await Bun.build({
        entrypoints: ['./test/chat/emoji-browser-fixture.tsx'],
        target: 'browser',
        outdir: dir,
        naming: 'fixture.[ext]',
      })
      expect(build.success).toBe(true)
      const script = await readFile(join(dir, 'fixture.js'), 'utf8')
      const html = join(dir, 'fixture.html')
      await writeFile(
        html,
        `<html><head><meta charset="utf-8"></head><body><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`,
      )
      const browser = Bun.spawn(
        [
          chrome,
          '--headless',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-background-networking',
          '--no-proxy-server',
          '--virtual-time-budget=20000',
          '--dump-dom',
          `file://${html}`,
        ],
        { stdout: 'pipe', stderr: 'pipe' },
      )
      const [output, code] = await Promise.all([
        new Response(browser.stdout).text(),
        browser.exited,
      ])
      expect(code).toBe(0)
      const match = output.match(/<body\b[^>]*>(.*?)<\/body>/s)
      if (!match?.[1]) throw new Error(`Missing browser results: ${output}`)
      const results = JSON.parse(match[1]) as { name: string; ok: boolean; error?: string }[]
      expect(results.filter((result) => !result.ok)).toEqual([])
      expect(results).toHaveLength(10)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  60000,
)
