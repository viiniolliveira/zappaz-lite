import { strict as assert } from 'node:assert'
import createApp from '../../server/src/create-app.ts'
import authRouter from '../../server/src/modules/auth/route.ts'
import { prisma } from '../../server/src/db/prisma.ts'

const app = createApp()
app.route('/', authRouter)
const signIn = (clientIp: string, forwardedFor: string) => app.request('https://auth.example.test/api/auth/sign-in/email', {
  method: 'POST',
  headers: { origin: 'https://auth.example.test', 'content-type': 'application/json', 'x-forwarded-for': forwardedFor },
  body: JSON.stringify({ email: 'missing@example.test', password: 'wrong-password' }),
}, { clientIp })
try {
  for (let index = 0; index < 5; index++) {
    assert.equal((await signIn('192.0.2.1', `203.0.113.${index + 1}`)).status, 401)
  }
  assert.equal((await signIn('192.0.2.1', '203.0.113.100')).status, 429)
  assert.equal((await signIn('192.0.2.2', '203.0.113.100')).status, 401)
} finally {
  await prisma.$disconnect()
}
