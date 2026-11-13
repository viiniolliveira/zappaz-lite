import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')
test.skipIf(!chrome)('PIX copy succeeds, fails visibly and is blocked when disabled in the browser', async () => {
  const dir = await mkdtemp('/tmp/opencode/payment-browser-')
  try {
    const build = await Bun.build({ entrypoints: ['./test/chat/payment-browser-fixture.tsx'], target: 'browser', outdir: dir, naming: 'fixture.js' })
    expect(build.success).toBe(true)
    const script = await readFile(join(dir, 'fixture.js'), 'utf8')
    const vite = Bun.spawn([process.execPath, 'run', 'vite', 'build', '--outDir', join(dir, 'dist')], { stdout: 'pipe', stderr: 'pipe' })
    const [viteOut, viteErr, viteCode] = await Promise.all([new Response(vite.stdout).text(), new Response(vite.stderr).text(), vite.exited])
    if (viteCode) throw new Error(`Vite build failed: ${viteOut} ${viteErr}`)
    const css = (await readdir(join(dir, 'dist/assets'))).find(file => /^index-.*\.css$/.test(file))
    if (!css) throw new Error('Vite did not emit the application stylesheet')
    const html = join(dir, 'dist/fixture.html')
    await writeFile(html, `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="assets/${css}"></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`)
    for (const theme of ['light', 'dark']) for (const scenario of ['success', 'failure', 'disabled']) {
      const browser = Bun.spawn([chrome!, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', '--window-size=390,844', '--virtual-time-budget=5000', '--dump-dom', `file://${html}?scenario=${scenario}&theme=${theme}`], { stdout: 'pipe', stderr: 'pipe' })
      const [output, errors, code] = await Promise.all([new Response(browser.stdout).text(), new Response(browser.stderr).text(), browser.exited])
      if (code) throw new Error(`Chrome failed: ${errors}`)
      const result = output.match(/<body[^>]*data-result="([^"]+)"/)?.[1]
      if (!result) throw new Error(`Missing result for ${theme}/${scenario}: ${output}`)
      const data = JSON.parse(result.replaceAll('&quot;', '"').replaceAll('&amp;', '&')) as {
        calls: string[]; disabled: boolean; buttonType: string; toasts: { type: string; text: string }[]
        layout: { left: number; right: number; parentLeft: number; parentRight: number; scrollWidth: number; clientWidth: number; viewport: number; css: string }
      }
      expect(data.calls).toEqual(scenario === 'disabled' ? [] : ['PIX-SINTETICO-SEM-DADOS-PESSOAIS'])
      expect(data.disabled).toBe(scenario === 'disabled')
      expect(data.buttonType).toBe('button')
      if (scenario === 'disabled') expect(data.toasts).toEqual([])
      else {
        expect(data.toasts).toHaveLength(1)
        expect(data.toasts[0].type).toBe(scenario === 'success' ? 'success' : 'error')
        expect(data.toasts[0].text).toContain(scenario === 'success' ? 'Código Pix copiado' : 'Não foi possível copiar o código Pix. Tente novamente.')
      }
      expect(data.layout.css).not.toBe('')
      expect(data.layout.left).toBeGreaterThanOrEqual(data.layout.parentLeft)
      expect(data.layout.right).toBeLessThanOrEqual(data.layout.parentRight)
      expect(data.layout.right).toBeLessThanOrEqual(data.layout.viewport)
      expect(data.layout.scrollWidth).toBeLessThanOrEqual(data.layout.clientWidth)
    }
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 60000)
