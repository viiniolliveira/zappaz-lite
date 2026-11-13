import { Agent as HttpAgent } from 'node:http'
import { Agent as HttpsAgent } from 'node:https'
import type { LookupFunction } from 'node:net'
import axios from 'axios'
import { config } from '../config.ts'
import { resolvePublicAddresses, validateOutboundUrl } from './outbound-policy.ts'
import { acquireOutbound } from './resource-limit.ts'

const lookup: LookupFunction = (hostname, options, callback) => {
  void resolvePublicAddresses(hostname)
    .then((addresses) => {
      const compatible = options.family
        ? addresses.filter(({ family }) => family === options.family)
        : addresses
      const first = compatible[0]
      if (!first) throw new Error('No permitted address for requested family')
      if (options.all) callback(null, compatible)
      else callback(null, first.address, first.family)
    })
    .catch((error: unknown) =>
      callback(error instanceof Error ? error : new Error('DNS lookup failed'), '', 0),
    )
}

const axiosInstance = axios.create({
  adapter: 'http',
  proxy: false,
  maxRedirects: 0,
  timeout: 15_000,
  maxContentLength: config.mediaMaxFileSizeBytes,
  maxBodyLength: config.mediaRequestBodyBytes,
  httpAgent: new HttpAgent({ lookup }),
  httpsAgent: new HttpsAgent({ lookup }),
})
const releases = new WeakMap<object, () => void>()
axiosInstance.interceptors.request.use((request) => {
  validateOutboundUrl(request.url ?? '')
  for (const name of [
    'host',
    'connection',
    'content-length',
    'transfer-encoding',
    'proxy-authorization',
    'upgrade',
  ]) {
    if (request.headers.has(name))
      throw new Error('Outbound transport headers cannot be overridden')
  }
  releases.set(request, acquireOutbound())
  // Total deadline includes DNS and trickle responses, unlike socket idle timeout.
  request.signal = AbortSignal.timeout(15_000)
  return request
})
axiosInstance.interceptors.response.use(
  (response) => {
    releases.get(response.config)?.()
    return response
  },
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.config) releases.get(error.config)?.()
    return Promise.reject(error)
  },
)

export default axiosInstance
