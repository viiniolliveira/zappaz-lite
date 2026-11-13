import type { Contact } from '@server/common/schema'
import { BadRequestError } from '../common/errors/bad-request-error.ts'

export interface ParsedVcard {
  name: string | null
  firstName: string | null
  lastName: string | null
  phones: { number: string; waid: string | null; types: string[] }[]
  emails: string[]
  organization: string | null
}

export interface NormalizedVcardContact {
  name: string | null
  vcard: string | null
  parsed: ParsedVcard | null
}

function contactText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text && !/^(undefined|null)$/i.test(text) ? text : null
}

function unescapeVcard(value: string): string {
  return value.replace(/\\([nN,;\\])/g, (_, character: string) =>
    character.toLowerCase() === 'n' ? '\n' : character,
  )
}

/** Split before unescaping, so escaped delimiters stay inside their field. */
function splitVcard(value: string, delimiter: string): string[] {
  const parts: string[] = []
  let start = 0
  let quoted = false
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '\\') {
      index++
      continue
    }
    if (value[index] === '"') quoted = !quoted
    if (value[index] !== delimiter || quoted) continue
    parts.push(value.slice(start, index))
    start = index + 1
  }
  parts.push(value.slice(start))
  return parts
}

/** Parse the textual vCard fields used by WhatsApp; never change the source. */
export function parseVcard(vcard: string): ParsedVcard | null {
  const lines = vcard
    .trim()
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n')
  if (
    lines[0]?.trim().toUpperCase() !== 'BEGIN:VCARD' ||
    lines.at(-1)?.trim().toUpperCase() !== 'END:VCARD'
  ) {
    return null
  }
  const result: ParsedVcard = {
    name: null,
    firstName: null,
    lastName: null,
    phones: [],
    emails: [],
    organization: null,
  }
  let structuredName: string | null = null
  let recognized = false
  for (const line of lines.slice(1, -1)) {
    const [header, ...values] = splitVcard(line, ':')
    if (!(header && values.length)) continue
    const [property, ...parameters] = splitVcard(header, ';')
    const field = property?.split('.').at(-1)?.toUpperCase()
    if (field === 'BEGIN' || field === 'END') return null
    if (!['FN', 'N', 'TEL', 'EMAIL', 'ORG'].includes(field ?? '')) continue
    // Encoded vCard 2.1 values need a dedicated decoder, not guessed text.
    if (parameters.some((parameter) => /^ENCODING=/i.test(parameter))) return null
    const rawValue = values.join(':')
    const value = contactText(unescapeVcard(rawValue))
    if (!value) continue
    recognized = true
    if (field === 'FN') result.name = value
    if (field === 'N') {
      const [family, given, additional, prefix, suffix] = splitVcard(rawValue, ';').map((part) =>
        contactText(unescapeVcard(part)),
      )
      result.firstName = given ?? null
      result.lastName = family ?? null
      structuredName = [prefix, given, additional, family, suffix].filter(Boolean).join(' ') || null
    }
    if (field === 'TEL') {
      const types: string[] = []
      let waid: string | null = null
      for (const parameter of parameters) {
        const separator = parameter.indexOf('=')
        const key = separator < 0 ? 'TYPE' : parameter.slice(0, separator).toUpperCase()
        const parameterValue = (separator < 0 ? parameter : parameter.slice(separator + 1)).replace(
          /^"(.*)"$/,
          '$1',
        )
        if (key === 'TYPE')
          types.push(
            ...parameterValue
              .split(',')
              .map((type) => type.trim().toUpperCase())
              .filter(Boolean),
          )
        if (key === 'WAID' && /^\d+$/.test(parameterValue)) waid = parameterValue
      }
      result.phones.push({
        number: value.replace(/^tel:/i, ''),
        waid,
        types: [...new Set(types)],
      })
    }
    if (field === 'EMAIL') result.emails.push(value.replace(/^mailto:/i, ''))
    if (field === 'ORG')
      result.organization =
        splitVcard(rawValue, ';')
          .map((part) => unescapeVcard(part).trim())
          .filter(Boolean)
          .join(' / ') || null
  }
  if (!recognized) return null
  result.name ??= structuredName
  return result
}

export function normalizeVcardContact(contact: {
  displayName?: unknown
  vcard?: unknown
}): NormalizedVcardContact {
  const vcard = typeof contact.vcard === 'string' ? contact.vcard : null
  const parsed = vcard ? parseVcard(vcard) : null
  const name = contactText(contact.displayName) ?? parsed?.name ?? null
  return { name, vcard, parsed }
}

export interface CreateVcardContact extends Contact {
  wuid: string
}

function escapeVcardText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

export const createVcard = (contact: CreateVcardContact): string => {
  const waid = /^(\d+)@s\.whatsapp\.net$/.exec(contact.wuid)?.[1]
  if (!waid) throw new BadRequestError('Contact must have a phone-number WhatsApp JID')
  if (contact.url && /[\r\n]/.test(contact.url)) {
    throw new BadRequestError('Contact URL must not contain line breaks')
  }
  const displayName = contact.displayName ?? `${contact.firstName} ${contact.lastName}`

  let result = `BEGIN:VCARD\nVERSION:3.0\nN:${escapeVcardText(contact.lastName)};${escapeVcardText(contact.firstName)};;;\nFN:${escapeVcardText(displayName)}`

  if (contact.organization) {
    result += `\nORG:${escapeVcardText(contact.organization)};`
  }

  if (contact.email) {
    result += `\nEMAIL:${escapeVcardText(contact.email)}`
  }

  if (contact.url) {
    result += `\nURL:${contact.url}`
  }

  result += `\nTEL;type=CELL;type=VOICE;waid=${waid}:+${waid}\nEND:VCARD`

  return result
}
