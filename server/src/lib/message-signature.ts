import { BadRequestError } from '../common/errors/bad-request-error.ts'
import type { TextSignature } from '../common/schema.ts'

export function signTextMessage(
  text: string,
  config: { signatureEnabled: boolean; signatureName: string },
  options: TextSignature = {},
) {
  if (!(options.signMessage ?? config.signatureEnabled)) return text
  const name = (options.signatureName ?? config.signatureName).trim()
  if (!name) throw new BadRequestError('Informe um nome para assinar a mensagem')
  return `*${name}:*\n${text}`
}
