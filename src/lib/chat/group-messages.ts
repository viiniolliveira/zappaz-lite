import { type ChatMessage, formatMessageDay } from './types'

function isGroupableImage(message: ChatMessage): boolean {
  return (
    !message.deletedAt &&
    !message.interactive &&
    message.type === 'image' &&
    message.media?.kind === 'image' &&
    !message.text?.trim()
  )
}

function canGroup(previous: ChatMessage, next: ChatMessage): boolean {
  return (
    isGroupableImage(previous) &&
    isGroupableImage(next) &&
    previous.sessionId === next.sessionId &&
    previous.conversationId === next.conversationId &&
    previous.fromMe === next.fromMe &&
    previous.sender.jid === next.sender.jid &&
    formatMessageDay(previous.orderAt) === formatMessageDay(next.orderAt)
  )
}

/** Keep identities and order; only four or more captionless images become grids. */
export function groupChatMessages(messages: ChatMessage[]): ChatMessage[][] {
  const groups: ChatMessage[][] = []
  let index = 0
  while (index < messages.length) {
    let end = index + 1
    while (end < messages.length && canGroup(messages[end - 1], messages[end])) end++
    const run = messages.slice(index, end)
    if (run.length > 3) groups.push(run)
    else for (const message of run) groups.push([message])
    index = end
  }
  return groups
}
