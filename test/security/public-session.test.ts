import { expect, test } from 'bun:test'
import { publicSession } from '../../server/src/modules/sessions/public-session.ts'

test('session projection never returns signing material or future database fields', () => {
  const row = {
    id: 's', token: 'public-integration-token', secret: 'synthetic-secret', status: 'close',
    createdAt: new Date(), updatedAt: new Date(), disconnectedAt: null, connectedAt: null,
    jid: null, enabled: true, userId: 'u', profilePictureUrl: null, displayName: 'Test', archived: false,
    config: null, futurePrivateField: 'synthetic-private',
  }
  const result = publicSession(row)
  expect(result.id).toBe('s')
  expect(result).not.toHaveProperty('token')
  expect(result).not.toHaveProperty('secret')
  expect(result).not.toHaveProperty('futurePrivateField')
  expect(JSON.stringify(result)).not.toContain('synthetic')
})
