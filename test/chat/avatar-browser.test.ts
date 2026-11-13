import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')
test.skipIf(!chrome)(
  'only refreshes visible stale conversation avatars for an active session',
  async () => {
    if (!chrome) throw new Error('google-chrome is required')
    const dir = await mkdtemp('/tmp/opencode/avatar-browser-')
    try {
      const build = await Bun.build({
        entrypoints: ['./test/chat/avatar-browser-fixture.tsx'],
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
      expect(output).toContain('<body>ok</body>')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  30000,
)
