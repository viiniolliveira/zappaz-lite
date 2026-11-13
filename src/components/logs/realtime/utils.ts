export function toLocalTime(date: Date | string): string {
  return new Date(date).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function toLocalDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('pt-BR')
}
