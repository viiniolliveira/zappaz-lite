import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const chrome = Bun.which('google-chrome')
test.skipIf(!chrome)('real gallery loads immediately without intersection, default hook remains lazy', async () => {
  if (!chrome) throw new Error('google-chrome is required')
  const dir = await mkdtemp('/tmp/opencode/media-gallery-loading-')
  try {
    const build = await Bun.build({ entrypoints: ['./test/chat/media-gallery-loading-fixture.tsx'], target: 'browser', outdir: dir, naming: '[name]-[hash].[ext]' })
    expect(build.success).toBe(true)
    const entry = build.outputs.find(output => output.kind === 'entry-point' && output.path.endsWith('.js'))
    if (!entry) throw new Error('Fixture JavaScript entry missing')
    const script = await readFile(entry.path, 'utf8')
    const html = join(dir, 'fixture.html')
    await writeFile(html, `<html><head><style>[data-slot="carousel"] { width: 600px } [data-slot="carousel-content"] { overflow: hidden; width: 600px } [data-slot="carousel-content"] > div { display: flex } [data-slot="carousel-item"] { flex: 0 0 100%; min-width: 0 }</style></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`)
    const browser = Bun.spawn([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', '--virtual-time-budget=10000', '--dump-dom', `file://${html}`], { stdout: 'pipe', stderr: 'pipe' })
    const [output, errors, code] = await Promise.all([new Response(browser.stdout).text(), new Response(browser.stderr).text(), browser.exited])
    expect({ code, errors: code ? errors : '' }).toEqual({ code: 0, errors: '' })
    expect(output).toMatch(/<body[^>]*>ok<\/body>/)
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 30000)
