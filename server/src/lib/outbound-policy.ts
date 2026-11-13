import { lookup } from 'node:dns/promises'
import { BlockList, isIP } from 'node:net'
import { z } from 'zod'
import { BadRequestError } from '../common/errors/bad-request-error.ts'
import { config } from '../config.ts'

const blocked = new BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  blocked.addSubnet(address, prefix, 'ipv4')
const globalV6 = new BlockList()
globalV6.addSubnet('2000::', 3, 'ipv6')
blocked.addSubnet('2001::', 23, 'ipv6')
blocked.addSubnet('2001:db8::', 32, 'ipv6')
blocked.addSubnet('2002::', 16, 'ipv6')
blocked.addSubnet('3fff::', 20, 'ipv6')

export function isPublicAddress(address: string): boolean {
  const family = isIP(address)
  if (family === 4) return !blocked.check(address, 'ipv4')
  if (family === 6) return globalV6.check(address, 'ipv6') && !blocked.check(address, 'ipv6')
  return false
}

export function validateOutboundUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new BadRequestError('Invalid outbound URL')
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (isIP(hostname) && !isPublicAddress(hostname))
  ) {
    throw new BadRequestError('Outbound destination is not permitted')
  }
  return url
}

export const OutboundUrlSchema = z
  .url()
  .max(2048)
  .refine((value) => {
    try {
      validateOutboundUrl(value)
      return true
    } catch {
      return false
    }
  }, 'Outbound destination is not permitted')

export const MediaSourceSchema = z
  .string()
  .min(1)
  .max(config.mediaMaxBase64Chars + 1024)
  .refine((value) => {
    const base64 = value.replace(/^data:[\w.+/-]+;base64,/, '')
    if (base64.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
      return (base64.length / 4) * 3 - padding <= config.mediaMaxFileSizeBytes
    }
    return OutboundUrlSchema.safeParse(value).success
  }, 'Expected base64 media or a permitted HTTP/HTTPS URL')

// Used by the socket itself: no separate DNS check followed by an unchecked lookup.
export async function resolvePublicAddresses(hostname: string, resolve = lookup) {
  const addresses = await resolve(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new BadRequestError('Outbound destination is not permitted')
  }
  return addresses
}
