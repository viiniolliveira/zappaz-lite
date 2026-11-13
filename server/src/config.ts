import 'dotenv/config'
import { ZodError } from 'zod'
import { parseConfig } from './config-schema.ts'

// Never include input values in startup errors: they may contain credentials.
function loadConfig() {
  try {
    return parseConfig(process.env)
  } catch (error) {
    if (error instanceof ZodError) {
      throw new Error(
        `Invalid environment configuration: ${error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`,
      )
    }
    throw error
  }
}

export const config = loadConfig()
