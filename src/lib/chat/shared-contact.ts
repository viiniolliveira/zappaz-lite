import type { MessageDTO } from './schemas'

export function sharedContactPhone(contact: MessageDTO['contacts'][number]): string | null {
  for (const phone of contact.parsed?.phones ?? []) {
    for (const value of [phone.waid, phone.number]) {
      const number = value?.replace(/[+\s().-]/g, '')
      if (number && /^[1-9]\d{6,14}$/.test(number)) return number
    }
  }
  return null
}
