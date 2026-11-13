import { afterAll, beforeAll, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = Bun.which('google-chrome') ?? (existsSync(macChrome) ? macChrome : null)
let css = ''
let buildDir = ''
beforeAll(async () => {
  if (!chrome) return
  buildDir = await mkdtemp(join(process.env.TMPDIR ?? '/tmp', 'sidebar-css-'))
  const build = Bun.spawn([process.execPath, './node_modules/vite/bin/vite.js', 'build', '--outDir', buildDir, '--emptyOutDir'], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])
  if (code !== 0) throw new Error(`Vite build failed: ${stdout}\n${stderr}`)
  const name = (await readdir(join(buildDir, 'assets'))).find(file => /^index-.*\.css$/.test(file))
  if (!name) throw new Error('Vite build did not emit the application stylesheet')
  css = await readFile(join(buildDir, 'assets', name), 'utf8')
}, 60000)
afterAll(async () => { if (buildDir) await rm(buildDir, { recursive: true, force: true }) })

test.skipIf(!chrome).each([[1200, 'chat'], [1200, 'default'], [390, 'chat'], [390, 'chat-focus'], [1200, 'chat-focus']] as const)('sidebar works at %spx viewport (%s layout)', async (width, layout) => {
  if (!chrome) throw new Error('google-chrome is required')
  const dir = await mkdtemp(join(process.env.TMPDIR ?? '/tmp', 'sidebar-'))
  try {
    const build = await Bun.build({ entrypoints: ['./test/layout/sidebar-browser-fixture.tsx'], target: 'browser', outdir: dir, naming: 'fixture.js' })
    expect(build.success).toBe(true)
    const script = await readFile(join(dir, 'fixture.js'), 'utf8')
    const html = join(dir, 'fixture.html')
    const htmlContent = `<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replaceAll('</style', '<\\/style')}</style></head><body><div id="root"></div><script type="module">${script.replaceAll('</script', '<\\/script')}</script></body></html>`
    await writeFile(html, htmlContent)
    const browser = Bun.spawn([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${dir}/chrome`, 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })
    try {
      let port = ''
      for (let i = 0; i < 100 && !port; i++) {
        try { port = (await readFile(join(dir, 'chrome/DevToolsActivePort'), 'utf8')).split('\n')[0] } catch { await Bun.sleep(50) }
      }
      if (!port) throw new Error('Chrome debugging port unavailable')
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
      const page = pages.find(item => item.type === 'page')
      if (!page) throw new Error('Chrome page unavailable')
      const socket = new WebSocket(page.webSocketDebuggerUrl)
      const result = await new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Browser fixture timed out')), 15000)
        socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 4, method: 'Fetch.enable', params: { patterns: [{ urlPattern: 'http://fixture.test/*', resourceType: 'Document' }] } })))
        socket.addEventListener('message', event => {
          const response = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: { requestId: string }; result?: { result?: { value?: string } }; error?: { message: string } }
          if (response.method === 'Fetch.requestPaused' && response.params) socket.send(JSON.stringify({ id: 5, method: 'Fetch.fulfillRequest', params: { requestId: response.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }], body: Buffer.from(htmlContent).toString('base64') } }))
          if (response.id === 4) socket.send(JSON.stringify({ id: 1, method: 'Emulation.setDeviceMetricsOverride', params: { width, height: 800, deviceScaleFactor: 1, mobile: width < 768 } }))
          if (response.error) { clearTimeout(timeout); reject(new Error(response.error.message)); return }
          if (response.id === 1) socket.send(JSON.stringify({ id: 2, method: 'Page.navigate', params: { url: `http://fixture.test/#layout-${layout}` } }))
          if (response.id === 2) socket.send(JSON.stringify({ id: 3, method: 'Runtime.evaluate', params: { expression: `new Promise(resolve => { const timer = setInterval(() => { const text = document.body?.textContent; if (text === 'ok' || text?.startsWith('FAIL:')) { clearInterval(timer); resolve(text) } }, 20) })`, awaitPromise: true, returnByValue: true } }))
          if (response.id === 3) { clearTimeout(timeout); resolve(response.result?.result?.value ?? 'missing result') }
        })
        socket.addEventListener('error', () => { clearTimeout(timeout); reject(new Error('Chrome debugging connection failed')) })
      })
      socket.close()
      expect(result).toBe('ok')
    } finally { browser.kill(); await browser.exited }
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 30000)
