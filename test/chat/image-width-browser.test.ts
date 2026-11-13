import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = Bun.which('google-chrome') ?? (await Bun.file(macChrome).exists() ? macChrome : null)
let directory = ''
let html = ''
beforeAll(async () => {
  if (!chrome) return
  directory = await mkdtemp(join(tmpdir(), 'zappaz-image-width-'))
  const outDir = join(directory, 'dist')
  const build = Bun.spawn([process.execPath, './node_modules/vite/bin/vite.js', 'build', '--outDir', outDir, '--emptyOutDir'], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])
  if (code !== 0) throw new Error(`Vite build failed: ${stdout}\n${stderr}`)
  const cssName = (await readdir(join(outDir, 'assets'))).find(file => /^index-.*\.css$/.test(file))
  if (!cssName) throw new Error('Application stylesheet missing')
  const css = await readFile(join(outDir, 'assets', cssName), 'utf8')
  const fixture = await Bun.build({ entrypoints: ['./test/chat/image-width-browser-fixture.tsx'], target: 'browser', outdir: directory, naming: 'fixture.js' })
  if (!fixture.success) throw new Error(`Fixture build failed: ${fixture.logs.join('\n')}`)
  const script = await readFile(join(directory, 'fixture.js'), 'utf8')
  html = join(directory, 'fixture.html')
  await writeFile(html, `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`)
}, 60000)
afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }) })

test.skipIf(!chrome).each([1200, 390])('image captions preserve bubble dimensions at %spx', async width => {
  if (!chrome) throw new Error('Chrome is required')
  const profile = join(directory, `chrome-${width}`)
  const browser = Bun.spawn([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })
  let socket: WebSocket | undefined
  try {
    let port = ''
    for (let i = 0; i < 100 && !port; i++) {
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0] } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        await Bun.sleep(50)
      }
    }
    if (!port) throw new Error('Chrome debugging port unavailable')
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
    const page = pages.find(item => item.type === 'page')
    if (!page) throw new Error('Chrome page unavailable')
    const connection = new WebSocket(page.webSocketDebuggerUrl)
    socket = connection
    const result = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Browser fixture timed out')), 15000)
      connection.addEventListener('open', () => connection.send(JSON.stringify({ id: 1, method: 'Emulation.setDeviceMetricsOverride', params: { width, height: 800, deviceScaleFactor: 1, mobile: width < 768 } })))
      connection.addEventListener('message', event => {
        const response = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: string } }; error?: { message: string } }
        if (response.error) { clearTimeout(timeout); reject(new Error(response.error.message)); return }
        if (response.id === 1) connection.send(JSON.stringify({ id: 2, method: 'Page.navigate', params: { url: `file://${html}` } }))
        if (response.id === 2) connection.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: `new Promise(resolve => { const timer = setInterval(() => { const text = document.body?.textContent; if (text === 'ok' || text?.startsWith('FAIL:')) { clearInterval(timer); resolve(text) } }, 20) })`, awaitPromise: true, returnByValue: true } }))
        if (response.id === 3) { clearTimeout(timeout); resolve(response.result?.result?.value ?? 'missing result') }
      })
      connection.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Chrome debugging connection failed')) })
    })
    expect(result).toBe('ok')
  } finally {
    socket?.close()
    browser.kill()
    await browser.exited
  }
}, 30000)
