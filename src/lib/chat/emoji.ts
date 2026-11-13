export function insertEmoji(text: string, emoji: string, start: number, end: number) {
  const value = text.slice(0, start) + emoji + text.slice(end)
  if (value.length > 4096) return null
  return { value, cursor: start + emoji.length }
}
