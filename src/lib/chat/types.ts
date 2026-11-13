import type { ConversationDTO, MessageDTO } from './schemas'

export type ChatMessage = MessageDTO & { localStatus?: 'sending' | 'failed' | 'uncertain' }
export type ChatConversation = ConversationDTO & { messages: ChatMessage[] }

export function contactInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toLocaleUpperCase('pt-BR') || '?'
  )
}

export function messagePreview(
  message: Pick<MessageDTO, 'deletedAt' | 'text' | 'type'> | null,
): string {
  if (!message) return 'Nenhuma mensagem ainda'
  if (message.deletedAt) return 'Mensagem removida'
  if (message.text) return message.text
  const labels = {
    text: 'Mensagem',
    image: 'Imagem',
    video: 'Vídeo',
    audio: 'Áudio',
    document: 'Documento',
    sticker: 'Figurinha',
    location: 'Localização',
    contact: 'Contato',
    poll: 'Enquete',
    album: 'Álbum de mídia',
    group_invite: 'Convite para grupo',
    system: 'Aviso da conversa',
    unavailable: 'Mensagem indisponível',
    unknown: 'Conteúdo não suportado',
  }
  return labels[message.type]
}

export function formatMessageTime(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}

export function formatMessageDay(date: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date))
}
