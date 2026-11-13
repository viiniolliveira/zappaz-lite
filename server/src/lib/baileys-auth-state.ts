import { prisma } from '@db/prisma'
import { logger } from '@lib/logger'
import { type AuthenticationCreds, BufferJSON, initAuthCreds, WAProto } from 'baileys'

const MONTH_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000
const YEAR_IN_MILLISECONDS = 365 * 24 * 60 * 60 * 1000

export const createBaileysAuthStateCacheManager = async (sessionId: string) => {
  const writeData = async (key: string, data: object) => {
    try {
      const ttl = key === 'creds' ? YEAR_IN_MILLISECONDS : MONTH_IN_MILLISECONDS * 3

      await prisma.baileysAuthState.upsert({
        where: {
          sessionId_key: { sessionId, key },
        },
        create: {
          sessionId,
          key,
          value: JSON.stringify(data, BufferJSON.replacer),
          expiresAt: new Date(Date.now() + ttl),
        },
        update: {
          value: JSON.stringify(data, BufferJSON.replacer),
          expiresAt: new Date(Date.now() + ttl),
        },
      })
    } catch (error) {
      logger.error({
        msg: `Error persisting ${key} in PostgreSQL, sessionId: ${sessionId}`,
        stack: (error as Error)?.stack,
        extra: {
          source: 'BaileysAuthStateCacheManager',
          function: 'writeData',
          sessionId,
          key,
        },
      })
    }
  }

  const readData = async (
    key: string,
  ): Promise<WAProto.Message.AppStateSyncKeyData | AuthenticationCreds | null> => {
    try {
      const stored = await prisma.baileysAuthState.findUnique({
        where: {
          sessionId_key: { sessionId, key },
        },
      })

      if (!stored) return null

      if (stored.expiresAt <= new Date()) {
        await prisma.baileysAuthState.delete({
          where: {
            sessionId_key: { sessionId, key },
          },
        })
        return null
      }

      return JSON.parse(stored.value, BufferJSON.reviver)
    } catch (error) {
      logger.error({
        msg: `Error reading ${key} from PostgreSQL, sessionId: ${sessionId}`,
        stack: (error as Error)?.stack,
        extra: {
          source: 'BaileysAuthStateCacheManager',
          function: 'readData',
          sessionId,
          key,
        },
      })
      return null
    }
  }

  const removeData = async (key: string) => {
    try {
      await prisma.baileysAuthState.deleteMany({
        where: { sessionId, key },
      })
    } catch (error) {
      logger.error({
        msg: `Error removing ${key} from PostgreSQL, sessionId: ${sessionId}`,
        stack: (error as Error)?.stack,
        extra: {
          source: 'BaileysAuthStateCacheManager',
          function: 'removeData',
          sessionId,
          key,
        },
      })
    }
  }

  const clearAllData = async () => {
    try {
      await prisma.baileysAuthState.deleteMany({
        where: { sessionId },
      })
    } catch (error) {
      logger.error({
        msg: `Error clearing auth state from PostgreSQL, sessionId: ${sessionId}`,
        stack: (error as Error)?.stack,
        extra: {
          source: 'BaileysAuthStateCacheManager',
          function: 'clearAllData',
          sessionId,
        },
      })
    }
  }

  const creds: AuthenticationCreds =
    ((await readData('creds')) as AuthenticationCreds) || initAuthCreds()

  return {
    clearAllData,
    saveCreds: () => writeData('creds', creds),
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: { [id: string]: unknown } = {}
          await Promise.all(
            ids.map(async (id) => {
              let value:
                | WAProto.Message.AppStateSyncKeyData
                | WAProto.Message.IAppStateSyncKeyData
                | AuthenticationCreds
                | null = await readData(`${type}-${id}`)
              if (type === 'app-state-sync-key' && value) {
                value = WAProto.Message.AppStateSyncKeyData.create(
                  value as WAProto.Message.IAppStateSyncKeyData,
                )
              }
              data[id] = value
            }),
          )
          return data
        },
        set: async (data: Record<string, Record<string, unknown>>) => {
          const tasks: Promise<unknown>[] = []
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id]
              const key = `${category}-${id}`
              tasks.push(value ? writeData(key, value) : removeData(key))
            }
          }
          await Promise.all(tasks)
        },
      },
    },
  }
}
