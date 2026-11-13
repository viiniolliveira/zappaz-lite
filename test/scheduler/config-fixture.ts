import { config } from '../../server/src/config.ts'

console.log(JSON.stringify([config.messageRetentionDays, config.webhookLogRetentionDays]))
