import { strict as assert } from 'node:assert'
import type { User } from '@generated/prisma'
import createApp from '../../server/src/create-app.ts'
import { requireRole } from '../../server/src/middleware/role.ts'

const app = createApp()
let reached = 0
app.use('*', async (c, next) => {
  const role = c.req.header('x-role')
  if (role) c.set('user', { id: 'fixture', role } as User)
  await next()
})
app.get('/both', requireRole(['user', 'admin']), c => { reached++; return c.text('ok') })
app.get('/admin', requireRole(['admin']), c => { reached++; return c.text('ok') })
app.get('/user', requireRole(['user']), c => { reached++; return c.text('ok') })
app.get('/none', requireRole([]), c => { reached++; return c.text('ok') })

for (const [path, role, status] of [
  ['/both', undefined, 401],
  ['/both', 'USER', 200],
  ['/both', 'ADMIN', 200],
  ['/admin', 'USER', 403],
  ['/admin', 'ADMIN', 200],
  ['/user', 'USER', 200],
  ['/user', 'ADMIN', 403],
  ['/none', 'USER', 403],
  ['/none', 'ADMIN', 403],
] as const) {
  const before = reached
  const response = await app.request(path, { headers: role ? { 'x-role': role } : {} })
  assert.equal(response.status, status, `${path} with ${role ?? 'no user'}`)
  assert.equal(reached, before + (status === 200 ? 1 : 0))
}
