import { afterAll, beforeAll, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'

const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const chrome = Bun.which('google-chrome') ?? (existsSync(macChrome) ? macChrome : null)
let directory = ''
let output = ''

beforeAll(async () => {
  directory = await mkdtemp(join(process.env.TMPDIR ?? '/tmp', 'zappaz-pwa-'))
  output = join(directory, 'dist')
  const build = Bun.spawn([process.execPath, './node_modules/vite/bin/vite.js', 'build', '--outDir', output], { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([new Response(build.stdout).text(), new Response(build.stderr).text(), build.exited])
  if (code) throw new Error(`PWA build failed: ${stdout}\n${stderr}`)
}, 60000)

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('production build provides an installable manifest, PNG icons and static-only precache', async () => {
  const manifest = JSON.parse(await readFile(join(output, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toMatchObject({ id: '/', name: 'Zappaz Lite', start_url: '/', scope: '/', display: 'standalone', lang: 'pt-BR' })
  for (const icon of manifest.icons) {
    const metadata = await sharp(join(output, icon.src)).metadata()
    expect(`${metadata.width}x${metadata.height}`).toBe(icon.sizes)
    expect(metadata.format).toBe('png')
  }
  const appleIcon = await sharp(join(output, 'icons/apple-touch-icon.png')).metadata()
  expect(appleIcon.width).toBe(180)
  const html = await readFile(join(output, 'index.html'), 'utf8')
  expect(html).toContain('rel="manifest"')
  expect(html).toContain('<link rel="icon" type="image/x-icon" href="/favicon.ico"')
  expect(await readFile(join(output, 'favicon.ico'))).toEqual(await readFile('public/favicon.ico'))
  expect(html).toContain('viewport-fit=cover')
  const worker = await readFile(join(output, 'sw.js'), 'utf8')
  expect(worker).toContain('offline.html')
  expect(worker).toContain('SKIP_WAITING')
  expect(worker).toContain('NetworkOnly')
  expect(worker).not.toMatch(/url:\s*["'](?:\/?index\.html|\/?api\/|\/?themes\/)/)
  const assets = (await readdir(join(output, 'assets'))).filter(name => /\.(js|css|woff2)$/.test(name))
  expect(assets.length).toBeGreaterThan(0)
  for (const asset of assets) expect(worker).toContain(`assets/${asset}`)
})

test.skipIf(!chrome)('service worker keeps private data out of caches, waits for updates and falls back offline', async () => {
  if (!chrome) throw new Error('Chrome is required')
  let revision = ''
  const serve = (port = 0) => Bun.serve({
    port,
    hostname: '127.0.0.1',
    async fetch(request) {
      const path = new URL(request.url).pathname
      if (path.startsWith('/api/')) return Response.json({ private: 'message or media', user: request.headers.get('cookie')?.match(/fixture_user=([^;]+)/)?.[1] ?? null })
      if (path === '/sw.js') return new Response(`${await readFile(join(output, 'sw.js'), 'utf8')}\n${revision}`, { headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-cache' } })
      const file = Bun.file(join(output, path))
      if (await file.exists()) return new Response(file)
      return new Response('<!doctype html><html><head><title>PWA fixture</title></head><body><h1>Online</h1></body></html>', { headers: { 'Content-Type': 'text/html' } })
    },
  })
  let server = serve()
  const serverPort = server.port
  const profile = join(directory, 'chrome')
  const browser = Bun.spawn([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--no-proxy-server', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdout: 'ignore', stderr: 'ignore' })
  let socket: WebSocket | undefined
  try {
    let port = ''
    for (let attempt = 0; attempt < 100 && !port; attempt++) {
      try { port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0] } catch { await Bun.sleep(50) }
    }
    if (!port) throw new Error('Chrome debugging port unavailable')
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
    const page = pages.find(item => item.type === 'page')
    if (!page) throw new Error('Chrome page unavailable')
    socket = new WebSocket(page.webSocketDebuggerUrl)
    const connection = socket
    await new Promise<void>((resolve, reject) => {
      connection.addEventListener('open', () => resolve(), { once: true })
      connection.addEventListener('error', () => reject(new Error('Chrome connection failed')), { once: true })
    })
    type Result = { result?: { value?: unknown }; exceptionDetails?: { text: string } }
    const pending = new Map<number, { resolve: (value: Result) => void; reject: (reason: Error) => void }>()
    let id = 0
    connection.addEventListener('message', event => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: Result; error?: { message: string } }
      if (!message.id) return
      const callback = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) callback?.reject(new Error(message.error.message))
      else callback?.resolve(message.result ?? {})
    })
    const command = (method: string, params: Record<string, unknown> = {}) => new Promise<Result>((resolve, reject) => {
      const requestId = ++id
      const timeout = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)) }, 15000)
      pending.set(requestId, { resolve: value => { clearTimeout(timeout); resolve(value) }, reject: error => { clearTimeout(timeout); reject(error) } })
      connection.send(JSON.stringify({ id: requestId, method, params }))
    })
    const evaluate = async (expression: string) => {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result?.value
    }
    const navigate = async (path: string, heading: string) => {
      await command('Page.navigate', { url: `${server.url.origin}${path}` })
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate('document.querySelector("h1")?.textContent') === heading) return
        await Bun.sleep(50)
      }
      throw new Error(`Navigation did not reach ${heading}: ${JSON.stringify(await evaluate('({ url: location.href, text: document.body?.textContent })'))}`)
    }
    await navigate('/chat', 'Online')
    expect(await evaluate(`(async () => { await navigator.serviceWorker.register('/sw.js'); await navigator.serviceWorker.ready; return true })()`)).toBe(true)
    await command('Page.reload')
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate('!!navigator.serviceWorker.controller')) break
      await Bun.sleep(50)
    }
    expect(await evaluate('!!navigator.serviceWorker.controller')).toBe(true)
    expect(await evaluate(`(async () => {
      document.cookie = 'fixture_user=user-a;path=/';
      const first = await (await fetch('/api/v1/conversations')).json();
      document.cookie = 'fixture_user=;Max-Age=0;path=/';
      await fetch('/api/auth/sign-out', { method: 'POST' });
      const loggedOut = await (await fetch('/api/v1/conversations')).json();
      document.cookie = 'fixture_user=user-b;path=/';
      const second = await (await fetch('/api/v1/conversations')).json();
      return [first.user, loggedOut.user, second.user];
    })()`)).toEqual(['user-a', null, 'user-b'])
    expect(await evaluate(`(async () => {
      await fetch('/api/v1/conversations'); await fetch('/api/v1/media/private');
      await fetch('/api/v1/messages', { method: 'POST', body: 'private' });
      const requests = (await Promise.all((await caches.keys()).map(async key => (await caches.open(key)).keys()))).flat();
      return requests.map(request => new URL(request.url).pathname);
    })()`)).toEqual(expect.arrayContaining(['/offline.html', '/icons/pwa-192.png']))
    const cachePaths = await evaluate(`(async () => (await Promise.all((await caches.keys()).map(async key => (await caches.open(key)).keys()))).flat().map(request => new URL(request.url).pathname))()`)
    expect(Array.isArray(cachePaths)).toBe(true)
    for (const path of cachePaths as string[]) expect(path).toMatch(/^\/(assets\/|icons\/|favicon\.ico$|offline\.html$|manifest\.webmanifest$)/)
    revision = '// next release'
    expect(await evaluate(`(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const active = registration.active;
      await registration.update();
      for (let i = 0; i < 200 && !registration.waiting; i++) await new Promise(resolve => setTimeout(resolve, 25));
      return !!registration.waiting && registration.active === active && navigator.serviceWorker.controller === active;
    })()`)).toBe(true)
    await command('Network.enable')
    await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 })
    // CDP's page-level offline setting does not disconnect service-worker fetches.
    await server.stop(true)
    await navigate('/chat?offline=1', 'Você está sem conexão')
    expect(await evaluate('document.body.textContent')).toContain('Mensagens e mídias não ficam disponíveis offline.')
    server = serve(serverPort)
    await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
    await navigate('/chat', 'Online')
  } finally {
    socket?.close()
    browser.kill()
    await browser.exited
    await server.stop(true)
  }
}, 60000)
