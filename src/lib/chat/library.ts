import { parseWhatsAppText, type WhatsAppTextPart } from '@shared/whatsapp-format'
import { DateTime } from 'luxon'
import type { LibraryEntry } from './schemas'

export function libraryLinks(entry: LibraryEntry): string[] {
  const links = new Set<string>()
  function visit(parts: WhatsAppTextPart[]) {
    for (const part of parts) {
      if (part.kind === 'link') links.add(part.href)
      else if ('children' in part) visit(part.children)
    }
  }
  if (entry.message.linkPreview) visit(parseWhatsAppText(entry.message.linkPreview.url))
  visit(parseWhatsAppText(entry.message.text ?? ''))
  return [...links]
}

export function groupLibraryEntries(
  entries: LibraryEntry[],
  allChats: boolean,
  now = DateTime.now(),
) {
  const groups = new Map<string, { label: string; entries: LibraryEntry[] }>()
  for (const entry of entries) {
    const date = DateTime.fromISO(entry.message.orderAt)
    let key = date.toFormat('yyyy-MM')
    let label = date.setLocale('pt-BR').toFormat('LLLL yyyy')
    if (date.hasSame(now, 'month')) label = 'Este mês'
    if (allChats) {
      if (date.hasSame(now, 'day')) {
        key = 'today'
        label = 'Hoje'
      } else if (date.hasSame(now.minus({ days: 1 }), 'day')) {
        key = 'yesterday'
        label = 'Ontem'
      } else if (date >= now.startOf('week')) {
        key = 'week'
        label = 'Esta semana'
      } else if (date >= now.startOf('week').minus({ weeks: 1 })) {
        key = 'last-week'
        label = 'Semana passada'
      }
    }
    const group = groups.get(key)
    if (group) group.entries.push(entry)
    else groups.set(key, { label, entries: [entry] })
  }
  return [...groups.entries()].map(([key, group]) => ({ key, ...group }))
}
