import { apiKey } from '@better-auth/api-key'
import { prismaAdapter } from '@better-auth/prisma-adapter'
import { betterAuth } from 'better-auth'
import { admin } from 'better-auth/plugins/admin'
import { adminAc, userAc } from 'better-auth/plugins/admin/access'
import { openAPI } from 'better-auth/plugins/open-api'
import { config } from '../config.ts'
import { prisma } from '../db/prisma.ts'
import { apiKeyPermissions } from './api-key-scope.ts'
import { allowedAppOrigins } from './app-url.ts'
import { authAfterPolicy, authPolicy } from './auth-policy.ts'

export const authAllowedEndpoints: Record<string, readonly string[]> = {
  GET: ['/get-session', '/admin/list-users', '/api-key/list'],
  POST: [
    '/sign-in/email',
    '/sign-out',
    '/update-user',
    '/change-email',
    '/change-password',
    '/api-key/create',
    '/api-key/delete',
    '/admin/create-user',
    '/admin/update-user',
    '/admin/set-role',
    '/admin/set-user-password',
    '/admin/remove-user',
  ],
}

const appEndpoints = {
  id: 'app-endpoints',
  async onRequest(request: Request) {
    const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '')
    const allowed = authAllowedEndpoints[request.method] ?? []
    if (!allowed.includes(path))
      return {
        response: Response.json({ message: 'Not found' }, { status: 404 }),
      }
    if (request.headers.has('x-api-key')) {
      return { response: Response.json({ message: 'Login session required' }, { status: 403 }) }
    } else if (request.method === 'POST') {
      const origin = request.headers.get('origin')
      if (
        (origin !== null &&
          !allowedAppOrigins(config.appUrl, config.isProduction).includes(origin)) ||
        (origin === null && request.headers.has('cookie'))
      )
        return { response: Response.json({ message: 'Untrusted request origin' }, { status: 403 }) }
    }
  },
}

export const auth = betterAuth({
  hooks: { before: authPolicy, after: authAfterPolicy },
  plugins: [
    appEndpoints,
    apiKey({
      defaultPrefix: 'zappaz_',
      requireName: true,
      maximumNameLength: 100,
      startingCharactersConfig: { charactersLength: 12 },
      keyExpiration: { defaultExpiresIn: null, minExpiresIn: 1 / 24 },
      rateLimit: { timeWindow: 60_000, maxRequests: 120 },
      enableSessionForAPIKeys: false,
      enableMetadata: true,
      permissions: {
        defaultPermissions: (userId, ctx) => apiKeyPermissions(userId, ctx.body.metadata),
      },
    }),
    openAPI({ disableDefaultReference: true }),
    admin({
      defaultRole: 'USER',
      adminRoles: ['ADMIN'],
      roles: { ADMIN: adminAc, USER: userAc },
    }),
  ],
  baseURL: config.appUrl,
  rateLimit: {
    customRules: {
      '/sign-in/email': { window: 600, max: 5 },
    },
  },
  secret: config.clientSecret,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  trustedOrigins: allowedAppOrigins(config.appUrl, config.isProduction),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    modelName: 'AuthSession',
    expiresIn: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  user: {
    changeEmail: { enabled: true, updateEmailWithoutVerification: true },
    fields: { name: 'firstName' },
    additionalFields: {
      lastName: { type: 'string', required: true },
      phone: { type: 'string', required: false },
      role: { type: ['USER', 'ADMIN'], defaultValue: 'USER', input: false },
    },
  },
  advanced: {
    useSecureCookies: config.isProduction,
    ipAddress: { ipAddressHeaders: ['x-zappaz-client-ip'] },
    database: { generateId: () => crypto.randomUUID() },
  },
})
