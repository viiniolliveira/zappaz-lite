import {
  type Bindings,
  type ChildLoggerOptions,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
  pino,
} from 'pino'

const redacted = '[REDACTED]'
const privateField =
  /password|secret|token|apikey|authorization|cookie|credential|key$|registrationid|signalidentities|pairingcode|routinginfo|qrcode/i
const privatePayload = new Set([
  'body',
  'payload',
  'raw',
  'rawcontent',
  'content',
  'data',
  'message',
  'stack',
  'config',
  'creds',
  'qr',
])

function sanitizeLogText(text: string) {
  return text
    .replace(/-----BEGIN [\s\S]*?-----END [^-]+-----/g, redacted)
    .replace(/\b(?:Bearer|Basic)\s+[^\s,;"']+/gi, redacted)
    .replace(/\bzappaz_[A-Za-z0-9_-]+/g, redacted)
    .replace(/https?:\/\/[^\s<>"']+/gi, (value) => {
      try {
        return `${new URL(value).origin}/${redacted}`
      } catch {
        return redacted
      }
    })
    .replace(
      /\b(password|secret|token|api[-_]?key|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi,
      `$1=${redacted}`,
    )
    .slice(0, 2048)
}

function sanitizeValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (typeof value === 'string') return sanitizeLogText(value)
  if (value === null || typeof value !== 'object') return value
  if (depth >= 8 || seen.has(value)) return redacted
  seen.add(value)
  if (value instanceof Error) {
    // Error messages/stacks and HTTP-client configs may contain arbitrary payloads and secrets.
    return {
      type: /^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(value.name) ? value.name : 'Error',
      ...('code' in value &&
      typeof value.code === 'string' &&
      /^(P\d{4}|[A-Z_]{2,64})$/.test(value.code)
        ? { code: value.code }
        : {}),
      ...(value.cause
        ? {
            cause:
              typeof value.cause === 'object'
                ? sanitizeValue(value.cause, seen, depth + 1)
                : redacted,
          }
        : {}),
    }
  }
  if (value instanceof Uint8Array || value instanceof ArrayBuffer) return '[BINARY]'
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value))
    return value.slice(0, 100).map((entry) => sanitizeValue(entry, seen, depth + 1))
  return sanitizeRecord(value, seen, depth + 1)
}

function sanitizeRecord(
  value: object,
  seen = new WeakSet<object>(),
  depth = 0,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 100)
      .map(([key, entry]) => {
        const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase()
        const sensitive =
          privateField.test(normalized) ||
          privatePayload.has(normalized) ||
          (['error', 'err', 'cause'].includes(normalized) && typeof entry === 'string')
        return [key, sensitive ? redacted : sanitizeValue(entry, seen, depth)]
      }),
  )
}

const redactingLoggerOptions: LoggerOptions = {
  formatters: {
    bindings: (bindings) => sanitizeRecord(bindings),
    log: (object) => sanitizeRecord(object),
  },
  hooks: {
    logMethod(args, method) {
      const [value, message] = args
      if (typeof value === 'string') {
        method.call(this, sanitizeLogText(value))
        return
      }
      Reflect.apply(method, this, [
        sanitizeValue(value, new WeakSet<object>(), 0),
        typeof message === 'string' ? sanitizeLogText(message) : undefined,
      ])
    },
  },
}

function protectChildBindings<Levels extends string>(logger: Logger<Levels>): Logger<Levels> {
  const child = logger.child
  logger.child = function <ChildLevels extends string = never>(
    this: Logger<Levels>,
    bindings: Bindings,
    options?: ChildLoggerOptions<ChildLevels>,
  ) {
    return child.bind(this)<ChildLevels>(sanitizeRecord(bindings), options)
  }
  return logger
}

export function createRedactingLogger(options: LoggerOptions, stream?: DestinationStream) {
  return protectChildBindings(pino({ ...options, ...redactingLoggerOptions }, stream))
}
