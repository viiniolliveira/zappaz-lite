import { isIP } from 'node:net'
import { config } from '../config.ts'

export function clientIp(
  request: Request,
  transportAddress: string | undefined,
): string | undefined {
  const proxyIp = request.headers.get('x-real-ip')
  return config.trustProxy && proxyIp && isIP(proxyIp) ? proxyIp : transportAddress
}
