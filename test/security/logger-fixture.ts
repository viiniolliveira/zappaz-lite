import { baileysLogger, logger } from '../../server/src/lib/logger.ts'

logger.info(
  { event: 'root', token: 'root-secret', payload: 'root-payload' },
  'root password=root-message-secret',
)
baileysLogger.warn({ event: 'suppressed' }, 'should not appear')
baileysLogger.error(
  { event: 'baileys', authorization: 'baileys-secret', data: 'baileys-payload' },
  'baileys Bearer baileys-message-secret',
)
const child = baileysLogger.child({
  cookie: 'child-secret',
  context: { apiKey: 'child-api-secret' },
})
child.error(
  { event: 'child', body: 'child-payload', nested: { password: 'child-password' } },
  'child token=child-message-secret',
)
logger.info({ event: 'root-after-child' }, 'root remains enabled')
