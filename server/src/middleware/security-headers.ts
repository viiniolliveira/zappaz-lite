import { createMiddleware } from 'hono/factory'
import { NONCE, secureHeaders } from 'hono/secure-headers'
import { config } from '../config.ts'
import type { AppEnv } from '../create-app.ts'

const policy = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'none'"],
  formAction: ["'self'"],
  // PDF.js decoders use WebAssembly; JavaScript eval remains prohibited.
  scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
  scriptSrcAttr: ["'none'"],
  // React, Radix, charts and the image editor use inline styles.
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
  mediaSrc: ["'self'", 'blob:', 'data:'],
  fontSrc: ["'self'", 'data:'],
  workerSrc: ["'self'", 'blob:'],
  frameSrc: ['https://www.youtube.com', 'https://www.youtube-nocookie.com'],
  connectSrc: [
    "'self'",
    (c: Parameters<typeof NONCE>[0]) => {
      // TLS may terminate at a proxy; only configured APP_URL defines the public origin.
      const url = new URL(config.isProduction ? config.appUrl : c.req.url)
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
      return url.origin
    },
  ],
}

const options = {
  strictTransportSecurity: false,
  xFrameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: {
    camera: [],
    microphone: ['self'],
    geolocation: [],
    payment: [],
    usb: [],
  },
}

const appHeaders = secureHeaders({ ...options, contentSecurityPolicy: policy })
const docsHeaders = secureHeaders({
  ...options,
  contentSecurityPolicy: {
    ...policy,
    scriptSrc: [...policy.scriptSrc, NONCE, 'https://cdn.jsdelivr.net'],
  },
})

export const securityHeaders = createMiddleware<AppEnv>((c, next) =>
  (c.req.path === '/docs' ? docsHeaders : appHeaders)(c, next),
)
