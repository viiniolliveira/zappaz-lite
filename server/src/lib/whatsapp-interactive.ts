import { normalizeMessageContent, type WAProto } from 'baileys'
import { z } from 'zod'
import type { InteractiveMessage } from './chat-contract.ts'

const nativeButtonParams = z.object({
  display_text: z.string(),
  id: z.string().optional(),
  url: z.string().optional(),
})

const nativePaymentParams = z.object({
  reference_id: z.string().trim().min(1),
  currency: z.string().regex(/^[A-Z]{3}$/),
  total_amount: z.object({ value: z.int().nonnegative(), offset: z.int().positive() }),
  order: z.object({
    items: z.array(z.object({ name: z.string().trim().min(1), quantity: z.int().positive() })),
  }),
  payment_settings: z.array(
    z.object({
      type: z.string(),
      pix_dynamic_code: z.object({ code: z.string().trim().min(1) }).optional(),
    }),
  ),
})

function safeUrl(value: string | null | undefined): string | null {
  const parsed = z.url({ protocol: /^https?$/ }).safeParse(value)
  return parsed.success ? parsed.data : null
}

function template(content: WAProto.IMessage) {
  return (
    content.templateMessage?.hydratedTemplate ?? content.templateMessage?.hydratedFourRowTemplate
  )
}

function interactiveTemplate(content: WAProto.IMessage) {
  return content.templateMessage?.interactiveMessageTemplate ?? content.interactiveMessage
}

/** Context belongs to the original envelope, not the extracted header media. */
export function messageContext(content: WAProto.IMessage) {
  return (
    interactiveTemplate(content)?.contextInfo ??
    content.templateMessage?.contextInfo ??
    content.buttonsMessage?.contextInfo ??
    content.buttonsResponseMessage?.contextInfo ??
    content.listMessage?.contextInfo ??
    content.listResponseMessage?.contextInfo ??
    content.pollCreationMessage?.contextInfo ??
    content.pollCreationMessageV2?.contextInfo ??
    content.pollCreationMessageV3?.contextInfo ??
    content.albumMessage?.contextInfo ??
    content.groupInviteMessage?.contextInfo ??
    content.imageMessage?.contextInfo ??
    content.videoMessage?.contextInfo ??
    content.audioMessage?.contextInfo ??
    content.documentMessage?.contextInfo ??
    content.stickerMessage?.contextInfo ??
    content.extendedTextMessage?.contextInfo ??
    content.locationMessage?.contextInfo ??
    content.liveLocationMessage?.contextInfo ??
    content.contactMessage?.contextInfo ??
    content.contactsArrayMessage?.contextInfo ??
    content.templateButtonReplyMessage?.contextInfo
  )
}

/** Unwrap only supported templates/interactive headers for the existing media pipeline. */
export function interactiveContent(input: WAProto.IMessage | null | undefined): WAProto.IMessage {
  const content = normalizeMessageContent(input) ?? {}
  const hydrated = template(content)
  const interactive = interactiveTemplate(content)
  const buttonsMessage = content.buttonsMessage
  const list = content.listMessage
  const header = hydrated ?? interactive?.header ?? buttonsMessage
  if (!hydrated && !interactive && !buttonsMessage && !list) return content
  if (header?.imageMessage) return { imageMessage: header.imageMessage }
  if (header?.videoMessage) {
    const video = header.videoMessage
    return { videoMessage: { ...video, url: video.url || video.staticUrl } }
  }
  if (header?.documentMessage) return { documentMessage: header.documentMessage }
  return {
    conversation:
      hydrated?.hydratedContentText ??
      interactive?.body?.text ??
      buttonsMessage?.contentText ??
      list?.description ??
      '',
  }
}

export function normalizeInteractiveMessage(content: WAProto.IMessage): {
  details: InteractiveMessage
  text: string | undefined
} | null {
  const hydrated = template(content)
  const interactive = interactiveTemplate(content)
  const buttonsMessage = content.buttonsMessage
  const list = content.listMessage
  if (!hydrated && !interactive && !buttonsMessage && !list) return null
  const buttons: InteractiveMessage['buttons'] = []
  let payment: InteractiveMessage['payment']
  for (const button of buttonsMessage?.buttons ?? []) {
    buttons.push({
      kind: button.buttonText ? 'reply' : 'unsupported',
      text: button.buttonText?.displayText ?? 'Ação não suportada',
      id: button.buttonId ?? null,
      url: null,
    })
  }
  for (const button of hydrated?.hydratedButtons ?? []) {
    if (button.urlButton) {
      const url = safeUrl(button.urlButton.url)
      buttons.push({
        kind: url ? 'url' : 'unsupported',
        text: button.urlButton.displayText ?? 'Abrir link',
        url,
        id: null,
      })
    } else if (button.quickReplyButton) {
      buttons.push({
        kind: 'reply',
        text: button.quickReplyButton.displayText ?? '',
        id: button.quickReplyButton.id ?? null,
        url: null,
      })
    } else if (button.callButton) {
      buttons.push({
        kind: 'unsupported',
        text: button.callButton.displayText ?? 'Ligar',
        id: null,
        url: null,
      })
    }
  }
  for (const button of interactive?.nativeFlowMessage?.buttons ?? []) {
    let json: unknown
    try {
      json = JSON.parse(button.buttonParamsJson ?? '{}')
    } catch {
      // Malformed external button data remains visible as an unsupported action.
      buttons.push({ kind: 'unsupported', text: 'Ação não suportada', id: null, url: null })
      continue
    }
    if (button.name === 'review_and_pay') {
      const parsed = nativePaymentParams.safeParse(json)
      const pix = parsed.success
        ? parsed.data.payment_settings.find((setting) => setting.type === 'pix_dynamic_code')
            ?.pix_dynamic_code
        : undefined
      if (parsed.success && pix && !payment) {
        payment = {
          referenceId: parsed.data.reference_id,
          currency: parsed.data.currency,
          totalAmount: parsed.data.total_amount,
          items: parsed.data.order.items,
          pixCode: pix.code,
        }
      } else {
        buttons.push({ kind: 'unsupported', text: 'Ação não suportada', id: null, url: null })
      }
      continue
    }
    const parsed = nativeButtonParams.safeParse(json)
    if (!parsed.success) {
      buttons.push({ kind: 'unsupported', text: 'Ação não suportada', id: null, url: null })
      continue
    }
    const params = parsed.data
    const url = button.name === 'cta_url' ? safeUrl(params.url) : null
    buttons.push({
      kind: url ? 'url' : button.name === 'quick_reply' ? 'reply' : 'unsupported',
      text: params.display_text,
      id: params.id ?? null,
      url,
    })
  }
  const text =
    hydrated?.hydratedContentText ??
    interactive?.body?.text ??
    buttonsMessage?.contentText ??
    list?.description ??
    undefined
  const title =
    hydrated?.hydratedTitleText ??
    interactive?.header?.title ??
    buttonsMessage?.text ??
    list?.title ??
    null
  const footer =
    hydrated?.hydratedFooterText ??
    interactive?.footer?.text ??
    buttonsMessage?.footerText ??
    list?.footerText ??
    null
  const header = hydrated ?? interactive?.header ?? buttonsMessage
  if (
    !text &&
    !title &&
    !footer &&
    !payment &&
    !buttons.length &&
    !list?.sections?.length &&
    !header?.imageMessage &&
    !header?.videoMessage &&
    !header?.documentMessage
  )
    return null
  return {
    details: {
      title,
      footer,
      buttons,
      ...(payment ? { payment } : {}),
      ...(list
        ? {
            list: {
              buttonText: list.buttonText ?? 'Ver opções',
              sections: (list.sections ?? []).map((section) => ({
                title: section.title ?? null,
                rows: (section.rows ?? []).map((row) => ({
                  id: row.rowId ?? null,
                  title: row.title ?? '',
                  description: row.description ?? null,
                })),
              })),
            },
          }
        : {}),
    },
    text,
  }
}
