import 'dotenv/config'
import { defineConfig } from 'prisma/config'
import { DatabaseEnvSchema } from './src/config-schema.ts'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'bun --tsconfig-override ./server/tsconfig.json server/src/db/seed.ts',
  },
  datasource: {
    url: DatabaseEnvSchema.parse(process.env).DATABASE_URL,
  },
})
