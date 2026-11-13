import { io } from 'socket.io-client'

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}
const origin = process.env.APP_URL
check(origin, 'APP_URL missing')
const base = 'http://127.0.0.1:3001'
const request = (path: string, options: RequestInit = {}) => fetch(base + path, options)
const health = await request('/health')
check(health.ok && (await health.json()).ok === true, 'health failed')
const spa = await request('/a-client-route', { headers: { accept: 'text/html' } })
const html = await spa.text()
check(spa.ok && html.includes('<html'), 'SPA fallback failed')
check(!!spa.headers.get('content-security-policy'), 'CSP missing')
const bundle = html.match(/<script[^>]+src="(\/assets\/[^" ]+\.js)"/)
check(bundle?.[1], 'frontend bundle missing from index')
const bundleResponse = await request(bundle[1])
check(bundleResponse.ok && (await bundleResponse.text()).length > 0, 'frontend bundle unavailable')
for (const path of ['/admin/session', '/api/v1/session']) {
  const response = await request(path)
  check([401, 403].includes(response.status), `private endpoint allowed: ${path}`)
  check(response.headers.get('cache-control')?.includes('no-store'), 'private no-store missing')
}
const login = await request('/api/auth/sign-in/email', {
  method: 'POST',
  headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }),
})
check(login.status === 200, 'login failed')
const setCookie = login.headers.getSetCookie().find((value) => value.includes('session_token='))
check(
  setCookie && /secure/i.test(setCookie) && /httponly/i.test(setCookie),
  'secure session cookie missing',
)
const cookie = setCookie.split(';')[0]
check(cookie, 'session cookie missing')
const session = await request('/api/auth/get-session', { headers: { origin, cookie } })
check(
  session.ok && (await session.json())?.user?.email === process.env.ADMIN_EMAIL,
  'session failed',
)
check(
  (await request('/admin/session', { headers: { origin, cookie } })).status === 200,
  'authenticated endpoint failed',
)
async function socketConnect(headers: Record<string, string>) {
  return new Promise<boolean>((resolve) => {
    const socket = io(base, {
      path: '/api/ws',
      transports: ['websocket'],
      extraHeaders: headers,
      reconnection: false,
      timeout: 5000,
    })
    socket.once('connect', () => {
      socket.disconnect()
      resolve(true)
    })
    socket.once('connect_error', () => {
      socket.disconnect()
      resolve(false)
    })
  })
}
check(await socketConnect({ origin, cookie }), 'authenticated websocket failed')
check(!(await socketConnect({ origin })), 'anonymous websocket connected')
check(
  !(await socketConnect({ origin: 'https://untrusted.example.test', cookie })),
  'foreign origin websocket connected',
)
