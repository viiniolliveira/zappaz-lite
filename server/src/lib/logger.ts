import { config } from '@server/config'
import type { ILogger } from 'baileys/lib/Utils/logger'
import { createRedactingLogger } from './log-sanitizer.ts'

const transport = {
  target: 'pino-pretty',
  options: {
    colorize: true,
  },
}

export const logger = createRedactingLogger({
  level: config.isProduction ? 'info' : 'debug',
  ...(config.isProduction ? {} : { transport }),
})

export const baileysLogger: ILogger = logger.child({ source: 'baileys' }, { level: 'error' })

export default {
  logger,
  baileysLogger,
}
