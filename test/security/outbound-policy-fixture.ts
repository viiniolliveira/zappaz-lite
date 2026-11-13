import { expect, test } from 'bun:test'
import outbound from '../../server/src/lib/axios-instance.ts'
import {
  isPublicAddress,
  resolvePublicAddresses,
  validateOutboundUrl,
} from '../../server/src/lib/outbound-policy.ts'

test('rejects private, reserved, mapped and alternate IP destinations', () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '192.168.1.1',
    '::1',
    '::',
    'fc00::1',
    'fe80::1',
    '::ffff:8.8.8.8',
    '2001:db8::1',
    '2002:7f00:1::',
  ])
    expect(isPublicAddress(address)).toBe(false)
  for (const url of [
    'http://2130706433',
    'http://0x7f000001',
    'http://[::1]',
    'http://user:pass@example.com',
    'file:///etc/passwd',
  ])
    expect(() => validateOutboundUrl(url)).toThrow()
  expect(isPublicAddress('8.8.8.8')).toBe(true)
  expect(isPublicAddress('2606:4700:4700::1111')).toBe(true)
  expect(validateOutboundUrl('https://example.com').hostname).toBe('example.com')
})

test('transport refuses unsafe URLs before its adapter and never follows redirects or proxies', async () => {
  let calls = 0
  const adapter = async () => {
    calls++
    throw new Error('synthetic redirect response')
  }
  await expect(outbound.get('http://127.0.0.1', { adapter })).rejects.toThrow()
  expect(calls).toBe(0)
  expect(outbound.defaults.maxRedirects).toBe(0)
  expect(outbound.defaults.maxContentLength).toBe(1024 * 1024)
  expect(outbound.defaults.maxBodyLength).toBe(4 * Math.ceil((1024 * 1024) / 3) + 1024 * 1024)
  expect(outbound.defaults.proxy).toBe(false)
  expect(outbound.defaults.adapter).toBe('http')
  await expect(outbound.get('https://example.com', { adapter })).rejects.toThrow(
    'synthetic redirect',
  )
  expect(calls).toBe(1)
})

test('checks every DNS answer on each socket lookup, rejecting rebinding', async () => {
  let calls = 0
  const resolve = async () => {
    calls++
    return [{ address: calls === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }]
  }
  expect(await resolvePublicAddresses('example.com', resolve)).toEqual([
    { address: '8.8.8.8', family: 4 },
  ])
  await expect(resolvePublicAddresses('example.com', resolve)).rejects.toThrow()
  await expect(
    resolvePublicAddresses('example.com', async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ]),
  ).rejects.toThrow()
})
