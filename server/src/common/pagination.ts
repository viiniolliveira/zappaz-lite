import { z } from 'zod'

// Keep query response strings while rejecting coercion, fractions and unbounded offsets.
export const PageSchema = z
  .string()
  .regex(/^[1-9]\d{0,4}$/)
  .refine((value) => Number(value) <= 10000)
  .default('1')
export const PageSizeSchema = z
  .string()
  .regex(/^[1-9]\d{0,2}$/)
  .refine((value) => Number(value) <= 100)
  .default('100')
