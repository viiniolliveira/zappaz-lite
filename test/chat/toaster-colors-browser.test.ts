import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')
for (const [viewport, size] of [['desktop', '1280,900'], ['mobile', '390,844']] as const) {
  test.skipIf(!chrome)(`Sonner uses rich colors (${viewport})`, async () => {
    if (!chrome) throw new Error('google-chrome is required')
    const dir = await mkdtemp('/tmp/opencode/toaster-colors-')
    try {
      const build = await Bun.build({ entrypoints: ['./test/chat/toaster-colors-browser-fixture.tsx'], target: 'browser', outdir: dir, naming: 'fixture.js' })
      expect(build.success).toBe(true)
      const script = await readFile(join(dir, 'fixture.js'), 'utf8')
      const vite = Bun.spawn([process.execPath, 'run', 'vite', 'build', '--outDir', join(dir, 'dist')], { stdout: 'pipe', stderr: 'pipe' })
      const [viteOut, viteErr, viteCode] = await Promise.all([new Response(vite.stdout).text(), new Response(vite.stderr).text(), vite.exited])
      if (viteCode) throw new Error(`Vite build failed: ${viteOut} ${viteErr}`)
      const css = (await readdir(join(dir, 'dist/assets'))).find(file => /^index-.*\.css$/.test(file))
      if (!css) throw new Error('Vite did not emit the application stylesheet')
      const html = join(dir, 'dist/fixture.html')
      await writeFile(html, `<html><head><link rel="stylesheet" href="assets/${css}"></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`)

      const args = [chrome, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', '--run-all-compositor-stages-before-draw', '--force-prefers-reduced-motion', `--window-size=${size}`, '--virtual-time-budget=3000']
      const screenshot = Bun.spawn([...args, `--screenshot=/tmp/opencode/chat-toaster-${viewport}.png`, `file://${html}`], { stdout: 'pipe', stderr: 'pipe' })
      expect(await screenshot.exited).toBe(0)
      const browser = Bun.spawn([...args, '--dump-dom', `file://${html}`], { stdout: 'pipe', stderr: 'pipe' })
      const [output, errors, code] = await Promise.all([new Response(browser.stdout).text(), new Response(browser.stderr).text(), browser.exited])
      expect({ code, errors: code ? errors : '' }).toEqual({ code: 0, errors: '' })
      const result = output.match(/<body[^>]*data-result="([^"]+)"/)?.[1]
      if (!result) throw new Error('Missing rendered toast results')
      const notices = JSON.parse(result.replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as { type: string; rich: string; opacity: number; width: number; height: number; x: number; y: number; background: string; normal: string; display: string; visibility: string }[]
      expect(notices.map(notice => notice.type)).toEqual(['success', 'warning', 'error'])
      const viewportSize = output.match(/<body[^>]*data-viewport="([^"]+)"/)?.[1]
      if (!viewportSize) throw new Error('Missing viewport dimensions')
      const [viewportWidth, viewportHeight] = viewportSize.split(',').map(Number)
      for (const notice of notices) {
        expect(notice.rich).toBe('true')
        expect(notice.opacity).toBeGreaterThan(0)
        expect(notice.width).toBeGreaterThan(0)
        expect(notice.height).toBeGreaterThan(0)
        expect(notice.x).toBeGreaterThanOrEqual(0)
        expect(notice.y).toBeGreaterThanOrEqual(0)
        expect(notice.x + notice.width).toBeLessThanOrEqual(viewportWidth)
        expect(notice.y + notice.height).toBeLessThanOrEqual(viewportHeight)
        expect(notice.display).not.toBe('none')
        expect(notice.visibility).toBe('visible')
        expect(notice.background).not.toBe('rgba(0, 0, 0, 0)')
        expect(notice.background).not.toBe(notice.normal)
      }
      expect(new Set(notices.map(notice => notice.background)).size).toBe(3)
      expect(output.match(/<body[^>]*data-css="([^"]+)"/)?.[1]).toBe('loaded')
    } finally { await rm(dir, { recursive: true, force: true }) }
  }, 60000)
}
