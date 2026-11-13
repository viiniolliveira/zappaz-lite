import { PhoneNumberFormatter } from './phone-number-formatter.js'

export class JidCreator {
  private static readonly GROUP_SUFFIX = '@g.us'
  private static readonly BROADCAST_SUFFIX = '@broadcast'
  private static readonly USER_SUFFIX = '@s.whatsapp.net'
  private static readonly LID_SUFFIX = '@lid'

  // Meaningful constants for magic numbers
  private static readonly GROUP_JID_MIN_LENGTH = 24
  private static readonly USER_JID_MIN_LENGTH = 18

  public static createJid(number: string): string {
    // Return the number if it's already a JID with known suffixes
    if (JidCreator.isJid(number)) {
      return number
    }

    // Clean up number (remove spaces, parentheses, etc.)
    let cleanedNumber = JidCreator.cleanNumber(number)

    // Handle group JIDs (contains dash and is of sufficient length)
    if (JidCreator.isGroupJid(cleanedNumber)) {
      return `${cleanedNumber.replace(/[^\d-]/g, '')}${JidCreator.GROUP_SUFFIX}`
    }

    // Handle broadcast JIDs
    if (JidCreator.isBroadcastJid(cleanedNumber)) {
      return `${cleanedNumber.replace(/[^\d-]/g, '')}${JidCreator.GROUP_SUFFIX}`
    }

    // Remove all non-numeric characters
    cleanedNumber = cleanedNumber.replace(/\D/g, '')

    // Handle long user JIDs (length >= 18 digits)
    if (cleanedNumber.length >= JidCreator.USER_JID_MIN_LENGTH) {
      return `${cleanedNumber}@g.us`
    }

    // Format the cleanedNumber using country-specific logic
    cleanedNumber = PhoneNumberFormatter.formatMXOrARNumber(cleanedNumber)
    cleanedNumber = PhoneNumberFormatter.formatBRNumber(cleanedNumber)

    // Default to WhatsApp user JID
    return `${cleanedNumber}${JidCreator.USER_SUFFIX}`
  }

  // Helper function to check if the number is already a JID
  private static isJid(number: string): boolean {
    return (
      number.includes(JidCreator.GROUP_SUFFIX) ||
      number.includes(JidCreator.USER_SUFFIX) ||
      number.includes(JidCreator.LID_SUFFIX) ||
      number.includes(JidCreator.BROADCAST_SUFFIX)
    )
  }

  // Helper function to clean up the number
  private static cleanNumber(number: string): string {
    return number
      .replace(/\s/g, '') // Remove all spaces
      .replace(/\+/g, '') // Remove plus sign
      .replace(/\(/g, '') // Remove opening parentheses
      .replace(/\)/g, '') // Remove closing parentheses
      .split(':')[0] // Remove everything after colon
      .split('@')[0] // Remove everything after @
  }

  // Helper function to check for group JIDs
  private static isGroupJid(number: string): boolean {
    return number.includes('-') && number.length >= JidCreator.GROUP_JID_MIN_LENGTH
  }

  // Helper function to check for broadcast JIDs
  private static isBroadcastJid(number: string): boolean {
    return number.includes(JidCreator.BROADCAST_SUFFIX)
  }
}
