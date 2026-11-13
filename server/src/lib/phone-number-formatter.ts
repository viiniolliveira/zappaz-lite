export class PhoneNumberFormatter {
  private static readonly BR_PHONE_REGEX = /^(\d{2})(\d{2})\d{1}(\d{8})$/
  private static readonly MX_AR_PHONE_REGEX = /^(\d{2})\d{1}(\d{10})$/
  private static readonly COUNTRY_CODES = {
    BRAZIL: '55',
    MEXICO: '52',
    ARGENTINA: '54',
  }

  // Formats Brazilian phone number
  public static formatBRNumber(jid: string): string {
    const match = PhoneNumberFormatter.BR_PHONE_REGEX.exec(jid)

    if (!match || match[1] !== PhoneNumberFormatter.COUNTRY_CODES.BRAZIL) {
      return jid
    }

    const [, countryCode, dddString, phoneNumber] = match
    const joker = Number.parseInt(phoneNumber[0], 10)
    const ddd = Number.parseInt(dddString, 10)

    if (joker < 7 || ddd < 31) {
      return match[0]
    }

    return `${countryCode}${dddString}${phoneNumber}`
  }

  // Formats Mexican or Argentine phone number using regex
  public static formatMXOrARNumber(jid: string): string {
    const match = PhoneNumberFormatter.MX_AR_PHONE_REGEX.exec(jid)

    if (!match) {
      return jid
    }

    const countryCode = match[1]

    // Check if the country code is Mexico (52) or Argentina (54)
    if (
      countryCode === PhoneNumberFormatter.COUNTRY_CODES.MEXICO ||
      countryCode === PhoneNumberFormatter.COUNTRY_CODES.ARGENTINA
    ) {
      return `${countryCode}${match[2]}` // Remove the third digit
    }

    return jid
  }
}
