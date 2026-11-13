import assert from 'node:assert/strict'
import { clientIp } from '../../server/src/lib/client-ip.ts'

const trusted = process.env.TRUST_PROXY === 'true'
const native = '192.0.2.10'
const request = (headers: Record<string, string> = {}) =>
  new Request('http://localhost/', { headers })

for (const ip of ['198.51.100.25', '2001:db8::1']) {
  assert.equal(clientIp(request({ 'x-real-ip': ip }), native), trusted ? ip : native)
  assert.equal(clientIp(request({ 'x-real-ip': ip }), undefined), trusted ? ip : undefined)
}
for (const invalid of [
  '198.51.100.25:443',
  '[2001:db8::1]:443',
  '198.51.100.1, 198.51.100.2',
  'proxy.example',
  'not-an-ip',
  '',
]) {
  assert.equal(clientIp(request({ 'x-real-ip': invalid }), native), native)
  assert.equal(clientIp(request({ 'x-real-ip': invalid }), undefined), undefined)
}
const forwarded = request({ forwarded: 'for=198.51.100.1', 'x-forwarded-for': '198.51.100.2' })
assert.equal(clientIp(forwarded, native), native)
assert.equal(clientIp(forwarded, undefined), undefined)
assert.equal(clientIp(request(), undefined), undefined)
