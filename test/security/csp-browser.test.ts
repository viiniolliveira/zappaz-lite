import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { Server as Engine } from '@socket.io/bun-engine'
import { Server as SocketServer } from 'socket.io'
import createApp from '../../server/src/create-app.ts'
import { createFrontendRouter } from '../../server/src/modules/frontend/route.ts'

let directory = ''
let output = ''
beforeAll(async () => {
  directory = await mkdtemp('/tmp/opencode/csp-')
  output = join(directory, 'dist')
  const build = Bun.spawn(
    [
      process.execPath,
      '--no-env-file',
      'node_modules/vite/bin/vite.js',
      'build',
      '--config',
      'test/security/vite-fixture.ts',
      '--outDir',
      output,
    ],
    {
      env: { PATH: process.env.PATH, HOME: directory, CSP_FIXTURE_DIR: directory },
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(build.stdout).text(),
    new Response(build.stderr).text(),
    build.exited,
  ])
  if (code) throw new Error(`Build failed: ${stdout}\n${stderr}`)
}, 90000)
afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})

test('production SPA and browser CSP enforcement', async () => {
  const chrome = Bun.which('google-chrome')
  if (!chrome) throw new Error('Google Chrome is required for CSP security tests')
  const app = createApp()
  const user = {
    id: 'user-1',
    email: 'fixture@example.test',
    name: 'Fixture',
    lastName: 'User',
    phone: null,
    role: 'USER',
    emailVerified: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
  const session = {
    id: 'session-1',
    userId: user.id,
    token: 'fixture-token',
    expiresAt: '2030-01-01T00:00:00.000Z',
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
  let loginBody: unknown
  let sessionRequestsWithCookie = 0
  const authenticated = (cookie: string | undefined) => cookie?.includes('fixture_auth=1') ?? false
  app.get('/api/auth/get-session', (c) =>
    c.json(authenticated(c.req.header('cookie')) ? { user, session } : null),
  )
  app.post('/api/auth/sign-in/email', async (c) => {
    loginBody = await c.req.json()
    if (
      (loginBody as { email?: string; password?: string }).email !== user.email ||
      (loginBody as { password?: string }).password !== 'fixture-password'
    )
      return c.json({ message: 'Invalid credentials' }, 401)
    c.header('Set-Cookie', 'fixture_auth=1; Path=/; HttpOnly; SameSite=Lax')
    return c.json({ user, session, token: session.token, redirect: false })
  })
  app.get('/api/v1/session', (c) => {
    if (!authenticated(c.req.header('cookie'))) return c.json({ error: 'Unauthorized' }, 401)
    sessionRequestsWithCookie++
    return c.json({ data: [] })
  })
  app.get('/probe', (c) =>
    c.html(
      '<!doctype html><script defer src="/socket-client.js"></script><script defer src="/probe.js"></script>',
    ),
  )
  const socketClient = await readFile('node_modules/socket.io-client/dist/socket.io.min.js', 'utf8')
  app.get('/socket-client.js', (c) =>
    c.body(socketClient, 200, { 'Content-Type': 'application/javascript' }),
  )
  app.get('/probe.js', (c) =>
    c.body(
      `
    window.probeReady = true;
    const inline = document.createElement('script'); inline.textContent = 'window.inlineRan = true'; document.head.append(inline);
    try { eval('window.evalRan = true') } catch { window.evalBlocked = true }
    const external = document.createElement('script'); external.src = 'https://external.invalid/evil.js'; document.head.append(external);
    const frame = document.createElement('iframe'); frame.src = 'https://external.invalid/'; document.body.append(frame);
    fetch('https://external.invalid/data').catch(() => {});
    const pdf = document.createElement('iframe'); pdf.sandbox = 'allow-same-origin'; pdf.onload = () => window.pdfLoaded = true; pdf.src = URL.createObjectURL(new Blob(['%PDF-1.4'], {type:'application/pdf'})); document.body.append(pdf);
    const image = new Image(); image.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='; image.onload = () => window.dataImage = true; document.body.append(image);
    const blobImage = new Image(); blobImage.src = URL.createObjectURL(new Blob([Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='), c => c.charCodeAt(0))], {type:'image/gif'})); blobImage.onload = () => window.blobImage = true; document.body.append(blobImage);
    const worker = new Worker(URL.createObjectURL(new Blob(['postMessage("ok")'], {type:'text/javascript'}))); worker.onmessage = e => { window.workerResult = e.data; worker.terminate() };
    const ws = new WebSocket('ws://' + location.host + '/fixture-socket/?EIO=4&transport=websocket'); ws.onopen = () => { window.socketOpened = true; ws.close() };
    const realtime = io({path:'/fixture-socket/', transports:['websocket'], reconnection:false});
    realtime.on('connect', () => { window.socketIoTransport = realtime.io.engine.transport.name; realtime.emit('fixture.echo', {message:'synthetic'}, response => { window.socketIoReply = response; realtime.disconnect() }) });
    realtime.on('connect_error', e => window.socketIoError = e.message);
    const wav = new ArrayBuffer(8044); const view = new DataView(wav);
    const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
    text(0, 'RIFF'); view.setUint32(4, 8036, true); text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 8000, true); view.setUint32(28, 8000, true); view.setUint16(32, 1, true); view.setUint16(34, 8, true); text(36, 'data'); view.setUint32(40, 8000, true);
    const audio = document.createElement('audio'); audio.muted = true; audio.src = URL.createObjectURL(new Blob([wav], {type:'audio/wav'})); audio.onloadedmetadata = () => window.audioMetadata = audio.duration > 0; const playButton = document.createElement('button'); playButton.textContent = 'Play audio'; playButton.id = 'play-audio'; document.body.prepend(playButton); playButton.onclick = () => audio.play().then(() => window.audioPlayed = true).catch(() => window.audioPlayed = false);
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 16; const context = canvas.getContext('2d'); context.fillRect(0, 0, 16, 16);
    const stream = canvas.captureStream(10); const recorder = new MediaRecorder(stream, {mimeType:'video/webm'}); const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data); recorder.onstop = () => { stream.getTracks().forEach(t => t.stop()); const video = document.createElement('video'); video.muted = true; video.src = URL.createObjectURL(new Blob(chunks, {type:'video/webm'})); video.onloadedmetadata = () => window.videoMetadata = video.videoWidth === 16; video.play().then(() => window.videoPlayed = true).catch(() => window.videoPlayed = false); };
    recorder.start(); setTimeout(() => { context.fillStyle = 'red'; context.fillRect(0, 0, 16, 16); setTimeout(() => recorder.stop(), 250); }, 100);
    navigator.mediaDevices.getUserMedia({audio:true}).then(s => {window.microphone = true; s.getTracks().forEach(t => t.stop())}).catch(() => {window.microphone = false});
  `,
      200,
      { 'Content-Type': 'application/javascript' },
    ),
  )
  app.route('/', createFrontendRouter(output))
  const engine = new Engine({ path: '/fixture-socket/' })
  const io = new SocketServer({ path: '/fixture-socket/' })
  io.bind(engine)
  io.on('connection', (client) => {
    client.on('fixture.echo', (payload: unknown, reply: (value: unknown) => void) => reply(payload))
  })
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request, server) {
      if (new URL(request.url).pathname.startsWith('/fixture-socket/'))
        return engine.handleRequest(request, server)
      return app.fetch(request)
    },
    websocket: engine.handler().websocket,
  })
  const embeddingServer = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: () =>
      new Response(`<iframe src="${server.url.origin}/sign-in"></iframe>`, {
        headers: { 'Content-Type': 'text/html' },
      }),
  })
  const profile = join(directory, 'chrome')
  const browser = Bun.spawn(
    [
      chrome,
      '--headless',
      '--no-sandbox',
      '--disable-gpu',
      '--no-proxy-server',
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { env: { PATH: process.env.PATH, HOME: directory }, stdout: 'ignore', stderr: 'ignore' },
  )
  let socket: WebSocket | undefined
  try {
    let port = ''
    for (let i = 0; i < 100 && !port; i++) {
      try {
        port = (await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]
      } catch {
        await Bun.sleep(50)
      }
    }
    if (!port) throw new Error('Chrome debugging port unavailable')
    const pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as {
      type: string
      webSocketDebuggerUrl: string
    }[]
    const page = pages.find((p) => p.type === 'page')
    if (!page) throw new Error('Chrome page unavailable')
    socket = new WebSocket(page.webSocketDebuggerUrl)
    const connection = socket
    await new Promise<void>((resolve, reject) => {
      connection.addEventListener('open', () => resolve(), { once: true })
      connection.addEventListener('error', () => reject(new Error('CDP connection failed')), {
        once: true,
      })
    })
    type Result = { result?: { value?: unknown }; exceptionDetails?: unknown }
    const pending = new Map<
      number,
      { resolve: (value: Result) => void; reject: (error: Error) => void }
    >()
    let id = 0
    const entries: { entry: { source: string; text: string } }[] = []
    const exceptions: unknown[] = []
    connection.addEventListener('message', (event) => {
      const notice = JSON.parse(String(event.data)) as {
        method?: string
        params: { entry: { source: string; text: string } }
      }
      if (notice.method === 'Log.entryAdded') entries.push(notice.params)
      if (notice.method === 'Runtime.exceptionThrown') exceptions.push(notice.params)
      const msg = JSON.parse(String(event.data)) as {
        id?: number
        result?: Result
        error?: { message: string }
      }
      if (!msg.id) return
      const callback = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) callback?.reject(new Error(msg.error.message))
      else callback?.resolve(msg.result ?? {})
    })
    const command = (method: string, params: Record<string, unknown> = {}) =>
      new Promise<Result>((resolve, reject) => {
        const requestId = ++id
        const timeout = setTimeout(() => {
          pending.delete(requestId)
          reject(new Error(`Timed out: ${method}`))
        }, 15000)
        pending.set(requestId, {
          resolve: (value) => {
            clearTimeout(timeout)
            resolve(value)
          },
          reject: (error) => {
            clearTimeout(timeout)
            reject(error)
          },
        })
        connection.send(JSON.stringify({ id: requestId, method, params }))
      })
    const evaluate = async (expression: string) => {
      const result = await command('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      })
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
      return result.result?.value
    }
    await command('Page.enable')
    await command('Runtime.enable')
    await command('Network.enable')
    await command('Log.enable')
    await command('Page.addScriptToEvaluateOnNewDocument', {
      source: `window.cspViolations = []; document.addEventListener('securitypolicyviolation', e => window.cspViolations.push({directive:e.effectiveDirective, blocked:e.blockedURI, source:e.sourceFile, line:e.lineNumber}));`,
    })
    await command('Page.navigate', { url: `${server.url.origin}/sign-in` })
    for (let i = 0; i < 150; i++) {
      if (await evaluate('document.querySelector("h1")?.textContent?.includes("Faça login")')) break
      await Bun.sleep(50)
    }
    expect(await evaluate('document.querySelector("h1")?.textContent')).toContain('Faça login')
    expect(await evaluate('!!document.querySelector("form input[type=email]")')).toBe(true)
    expect(await evaluate('window.cspViolations')).toEqual([])
    expect(await evaluate('document.cookie')).toBe('')
    expect(await evaluate('fetch("/api/v1/session").then(r => r.status)')).toBe(401)
    await evaluate('document.querySelector("input[type=email]").focus()')
    await command('Input.insertText', { text: user.email })
    await evaluate('document.querySelector("input[type=password]").focus()')
    await command('Input.insertText', { text: 'incorrect-password' })
    await evaluate('document.querySelector("form button[type=submit]").click()')
    for (let i = 0; i < 100; i++) {
      if ((loginBody as { password?: string } | undefined)?.password === 'incorrect-password') break
      await Bun.sleep(50)
    }
    expect(loginBody).toMatchObject({ email: user.email, password: 'incorrect-password' })
    expect(await evaluate('fetch("/api/v1/session").then(r => r.status)')).toBe(401)
    expect(await evaluate('location.pathname')).toBe('/sign-in')
    await evaluate(
      '(() => { const input = document.querySelector("input[type=password]"); input.focus(); input.select() })()',
    )
    await command('Input.insertText', { text: 'fixture-password' })
    await evaluate('document.querySelector("form button[type=submit]").click()')
    for (let i = 0; i < 150; i++) {
      if (
        await evaluate(
          'location.pathname === "/sessions" && document.querySelector("h1")?.textContent === "Sessões"',
        )
      )
        break
      await Bun.sleep(50)
    }
    expect(loginBody).toMatchObject({ email: user.email, password: 'fixture-password' })
    expect(
      await evaluate(
        '({path:location.pathname, heading:document.querySelector("h1")?.textContent})',
      ),
    ).toEqual({ path: '/sessions', heading: 'Sessões' })
    expect(await evaluate('document.cookie')).toBe('')
    const cookies = await command('Network.getCookies', { urls: [server.url.origin] })
    expect(cookies).toMatchObject({
      cookies: [{ name: 'fixture_auth', value: '1', httpOnly: true, sameSite: 'Lax' }],
    })
    expect(await evaluate('fetch("/api/v1/session").then(r => r.status)')).toBe(200)
    expect(sessionRequestsWithCookie).toBeGreaterThan(0)
    await command('Page.reload')
    for (let i = 0; i < 150; i++) {
      if (
        await evaluate(
          'location.pathname === "/sessions" && document.querySelector("h1")?.textContent === "Sessões"',
        )
      )
        break
      await Bun.sleep(50)
    }
    expect(
      await evaluate(
        '({path:location.pathname, heading:document.querySelector("h1")?.textContent})',
      ),
    ).toEqual({ path: '/sessions', heading: 'Sessões' })
    await evaluate(`document.querySelector('a[href="/chat"]').click()`)
    for (let i = 0; i < 150; i++) {
      if (
        await evaluate(
          'location.pathname === "/chat" && document.querySelector("h1")?.textContent === "Chat"',
        )
      )
        break
      await Bun.sleep(50)
    }
    expect(
      await evaluate(
        '({path:location.pathname, heading:document.querySelector("h1")?.textContent})',
      ),
    ).toEqual({ path: '/chat', heading: 'Chat' })
    const spaViolations = await evaluate('window.cspViolations')

    // Bounded React fixtures: synthetic messages/services, real chat components and browser APIs.
    const waitFor = async (expression: string, label: string) => {
      for (let i = 0; i < 300; i++) {
        if (await evaluate(expression)) return
        await Bun.sleep(50)
      }
      throw new Error(
        `Timed out: ${label}; ${await evaluate('document.body.innerText.slice(-1000)')}; exceptions: ${JSON.stringify(exceptions)}`,
      )
    }
    await command('Page.navigate', {
      url: `${server.url.origin}/test/security/components-fixture.html`,
    })
    await waitFor('!!document.querySelector("#open-conversation")', 'component fixture')
    await evaluate('document.querySelector("#open-conversation").click()')
    await waitFor(
      `document.body.innerText.includes('Imagem sintética CSP') && !!document.querySelector('[aria-label="Gravar áudio"]')`,
      'conversation and composer',
    )
    await waitFor(
      'document.querySelector("li img")?.src.startsWith("blob:") && document.querySelector("li img").naturalWidth === 16',
      'full synthetic message image',
    )
    expect(await evaluate('window.cspViolations')).toEqual([])
    const clickReal = async (selector: string) => {
      const point = (await evaluate(
        `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`,
      )) as { x: number; y: number }
      await command('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...point,
        button: 'left',
        clickCount: 1,
      })
      await command('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        ...point,
        button: 'left',
        clickCount: 1,
      })
    }
    await clickReal('[aria-label="Gravar áudio"]')
    await waitFor(
      `!!document.querySelector('[aria-label="Pausar gravação"]')`,
      'real recorder starts with fake device',
    )
    await Bun.sleep(1200)
    await evaluate(`document.querySelector('[aria-label="Pausar gravação"]').click()`)
    await waitFor(
      `!!document.querySelector('[aria-label="Enviar áudio"]:not(:disabled)')`,
      'recording ready',
    )
    await evaluate(`document.querySelector('[aria-label="Enviar áudio"]').click()`)
    await waitFor(
      'document.querySelector("#sent").textContent.includes("audio-")',
      'recording sent to synthetic callback',
    )
    const recording = JSON.parse(
      String(await evaluate('document.querySelector("#sent").textContent')),
    ) as { type: string; size: number; voice: boolean }
    expect(recording.voice).toBe(true)
    expect(recording.type).toStartWith('audio/')
    expect(recording.size).toBeGreaterThan(0)
    expect(await evaluate('window.cspViolations')).toEqual([])

    await evaluate(
      `(async () => { const canvas = document.createElement('canvas'); canvas.width=16; canvas.height=12; canvas.getContext('2d').fillRect(0,0,16,12); const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); const transfer = new DataTransfer(); transfer.items.add(new File([blob], 'fixture.png', {type:'image/png'})); const input = document.querySelector('input[aria-label="Anexar arquivo"]'); Object.defineProperty(input, 'files', {configurable:true,value:transfer.files}); input.dispatchEvent(new Event('change', {bubbles:true})); })()`,
    )
    await waitFor(
      '[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Editar")',
      'image attachment',
    )
    await evaluate(
      '[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Editar").click()',
    )
    await waitFor(
      '[...document.querySelectorAll("button")].some(b => b.textContent.trim() === "Aplicar" && !b.disabled)',
      'image editor',
    )
    await evaluate(
      '[...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Aplicar").click()',
    )
    await waitFor(
      `!!document.querySelector('[aria-label="Restaurar imagem original"]')`,
      'image exported',
    )
    await evaluate(`document.querySelector('[aria-label="Enviar 1 arquivo"]').click()`)
    await waitFor(
      'document.querySelector("#sent").textContent.includes("fixture-editada.png")',
      'edited image callback',
    )
    const exported = JSON.parse(
      String(await evaluate('document.querySelector("#sent").textContent')),
    ) as { name: string; type: string; size: number; voice: boolean }
    expect(exported).toMatchObject({ name: 'fixture-editada.png', type: 'image/png', voice: false })
    expect(exported.size).toBeGreaterThan(0)
    expect(await evaluate('window.cspViolations')).toEqual([])

    await command('Page.navigate', {
      url: `${server.url.origin}/test/security/pdf-fixture.html?gallery`,
    })
    await waitFor(
      'document.body.textContent === "ok" || document.body.textContent.startsWith("FAIL:")',
      'gallery and explicit PDF flow',
    )
    expect(await evaluate('document.body.textContent')).toBe('ok')
    expect(await evaluate('window.cspViolations')).toEqual([])

    await command('Page.navigate', { url: `${server.url.origin}/probe` })
    for (let i = 0; i < 100; i++) {
      if (await evaluate('!!document.querySelector("#play-audio")')) break
      await Bun.sleep(50)
    }
    const button = (await evaluate(
      '(() => { const r = document.querySelector("#play-audio").getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2} })()',
    )) as { x: number; y: number }
    await command('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      ...button,
      button: 'left',
      clickCount: 1,
    })
    await command('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      ...button,
      button: 'left',
      clickCount: 1,
    })
    for (let i = 0; i < 100; i++) {
      if (
        await evaluate(
          'window.probeReady && window.dataImage && window.blobImage && window.workerResult && window.socketOpened && (window.socketIoReply || window.socketIoError) && window.audioMetadata && window.audioPlayed !== undefined && window.videoMetadata && window.videoPlayed !== undefined && window.microphone !== undefined && window.cspViolations.length >= 5',
        )
      )
        break
      await Bun.sleep(50)
    }
    expect(
      await evaluate(
        '({ready:window.probeReady, inline:!!window.inlineRan, evalBlocked:window.evalBlocked, data:window.dataImage, blob:window.blobImage, worker:window.workerResult, socket:window.socketOpened, audioMetadata:window.audioMetadata, audioPlayed:window.audioPlayed, videoMetadata:window.videoMetadata, videoPlayed:window.videoPlayed, microphone:window.microphone})',
      ),
    ).toEqual({
      ready: true,
      inline: false,
      evalBlocked: true,
      data: true,
      blob: true,
      worker: 'ok',
      socket: true,
      audioMetadata: true,
      audioPlayed: true,
      videoMetadata: true,
      videoPlayed: true,
      microphone: true,
    })
    expect(
      await evaluate(
        '({reply:window.socketIoReply, error:window.socketIoError ?? null, transport:window.socketIoTransport})',
      ),
    ).toEqual({ reply: { message: 'synthetic' }, error: null, transport: 'websocket' })
    const violations = (await evaluate('window.cspViolations')) as {
      directive: string
      blocked: string
    }[]
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ directive: 'script-src-elem', blocked: 'inline' }),
        expect.objectContaining({ directive: 'script-src', blocked: 'eval' }),
        expect.objectContaining({
          directive: 'script-src-elem',
          blocked: 'https://external.invalid/evil.js',
        }),
        expect.objectContaining({ directive: 'frame-src', blocked: 'https://external.invalid' }),
        expect.objectContaining({
          directive: 'connect-src',
          blocked: 'https://external.invalid/data',
        }),
      ]),
    )
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ directive: 'frame-src', blocked: 'blob' }),
      ]),
    )
    expect(spaViolations).toEqual([])
    await command('Page.navigate', { url: embeddingServer.url.origin })
    for (let i = 0; i < 100; i++) {
      if (
        entries.some(
          ({ entry }) =>
            entry.source === 'security' && entry.text.includes("frame-ancestors 'none'"),
        )
      )
        break
      await Bun.sleep(50)
    }
    expect(
      entries.some(
        ({ entry }) =>
          entry.source === 'security' &&
          entry.text.includes("frame-ancestors 'none'") &&
          entry.text.includes('blocked'),
      ),
    ).toBe(true)
  } finally {
    socket?.close()
    browser.kill()
    await browser.exited
    await server.stop(true)
    await embeddingServer.stop(true)
    io.close()
  }
}, 90000)
