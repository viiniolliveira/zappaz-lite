export function parseAppUrl(value: string | undefined, isProduction: boolean) {
  if (isProduction && !value) throw new Error('APP_URL is required in production')
  const input = value ?? 'http://localhost:5173'
  if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(input))
    throw new Error('APP_URL must be an HTTP origin without path or credentials')
  const url = new URL(input)
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('APP_URL must be an HTTP origin without path or credentials')
  if (isProduction && url.protocol !== 'https:')
    throw new Error('APP_URL must use HTTPS in production')
  return url.origin
}

export function allowedAppOrigins(appUrl: string, isProduction: boolean) {
  return isProduction
    ? [appUrl]
    : [
        ...new Set([
          appUrl,
          'http://localhost:3001',
          'http://localhost:5173',
          'http://127.0.0.1:3001',
          'http://127.0.0.1:5173',
        ]),
      ]
}
