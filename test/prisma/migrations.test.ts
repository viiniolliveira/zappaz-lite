import { expect, test } from 'bun:test'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

test('the initial migration defines the base schema and protects the last administrator', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const migrations = join(root, 'server/prisma/migrations')
  const entries = await readdir(migrations, { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  expect(directories).toEqual(['20261109222113_init'])

  const sql = await readFile(join(migrations, '20261109222113_init', 'migration.sql'), 'utf8')
  const table = (name: string) => {
    const definition = sql.match(new RegExp(`CREATE TABLE "${name}" \\(([\\s\\S]*?)\\n\\);`))
    expect(definition).not.toBeNull()
    return definition?.[1] ?? ''
  }

  const user = table('User')
  const session = table('WaSession')
  expect(user).not.toMatch(/^\s*"password"\s/m)
  expect(session).not.toMatch(/^\s*"(?:token|secret)"\s/m)
  expect(table('AuthSession')).toMatch(/^\s*"token"\s+TEXT\s+NOT NULL/m)
  expect(table('Account')).toMatch(/^\s*"password"\s+TEXT/m)
  expect(table('WaContact')).toMatch(/^\s*"avatarCheckedAt"\s+TIMESTAMP\(3\)\s*,?\s*$/m)
  for (const name of [
    'Verification',
    'Apikey',
    'WaConversationLabel',
    'WaConversationLabelLink',
    'WaQuickMessage',
  ]) {
    table(name)
  }
  const config = table('WaConfig')
  expect(config).toMatch(/"signatureEnabled"\s+BOOLEAN\s+NOT NULL\s+DEFAULT false/i)
  expect(config).toMatch(/"signatureName"\s+TEXT\s+NOT NULL\s+DEFAULT ''/i)

  for (const index of [
    'CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token")',
    'CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId")',
    'CREATE INDEX "Apikey_key_idx" ON "Apikey"("key")',
    'CREATE UNIQUE INDEX "WaConversationLabel_sessionId_name_key" ON "WaConversationLabel"("sessionId", "name")',
    'CREATE INDEX "WaConversationLabelLink_sessionId_labelId_conversationId_idx" ON "WaConversationLabelLink"("sessionId", "labelId", "conversationId")',
    'CREATE UNIQUE INDEX "WaQuickMessage_sessionId_command_key" ON "WaQuickMessage"("sessionId", "command")',
    'CREATE INDEX "WaMessage_sessionId_hasLink_orderAt_id_idx" ON "WaMessage"("sessionId", "hasLink", "orderAt", "id")',
    'CREATE INDEX "WaMessage_sessionId_type_orderAt_id_idx" ON "WaMessage"("sessionId", "type", "orderAt", "id")',
    'CREATE INDEX "WaMessage_sessionId_orderAt_id_idx" ON "WaMessage"("sessionId", "orderAt", "id")',
    'CREATE INDEX "WaConversation_sessionId_contactId_idx" ON "WaConversation"("sessionId", "contactId")',
  ])
    expect(sql).toContain(index)

  for (const relation of [
    'FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE',
    'FOREIGN KEY ("referenceId") REFERENCES "User"("id") ON DELETE CASCADE',
    'FOREIGN KEY ("sessionId", "conversationId") REFERENCES "WaConversation"("sessionId", "id") ON DELETE CASCADE',
    'FOREIGN KEY ("sessionId", "labelId") REFERENCES "WaConversationLabel"("sessionId", "id") ON DELETE CASCADE',
  ])
    expect(sql).toContain(relation)

  expect(sql).toContain('CREATE FUNCTION protect_last_admin() RETURNS trigger LANGUAGE plpgsql')
  expect(sql).toContain("pg_advisory_xact_lock(hashtextextended('zappaz:last-admin', 0))")
  expect(sql).toContain("RAISE EXCEPTION 'Cannot remove the last administrator'")
  expect(sql).toContain('CREATE TRIGGER "User_protect_last_admin"')
  expect(sql).toContain('BEFORE UPDATE OF "role", "banned" OR DELETE ON "User"')
  expect(sql).toContain('FOR EACH ROW EXECUTE FUNCTION protect_last_admin()')
})
