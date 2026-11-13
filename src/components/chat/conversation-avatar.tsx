import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { refreshChatAvatarAtom } from '@/atoms/chat-avatar'
import { chatSessionStateAtom } from '@/atoms/chat-cache'
import { isAvatarExpired } from '@/lib/chat/avatar'
import { type ChatConversation, contactInitials } from '@/lib/chat/types'
import ContactAvatar from './contact-avatar'

export default function ConversationAvatar({ conversation }: { conversation: ChatConversation }) {
  const refresh = useSetAtom(refreshChatAvatarAtom)
  const session = useAtomValue(chatSessionStateAtom)
  const element = useRef<HTMLSpanElement>(null)
  const attempted = useRef<string | null>(null)
  const [visible, setVisible] = useState(false)
  const [failed, setFailed] = useState(false)
  const contact = conversation.contact
  const connected = !!session?.connected && session.enabled

  useEffect(() => {
    if (!element.current || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting))
    })
    observer.observe(element.current)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) {
      attempted.current = null
      return
    }
    if (!contact || !connected || !isAvatarExpired(contact.avatarCheckedAt)) return
    const key = `${contact.sessionId}/${contact.id}/${contact.avatarCheckedAt}`
    if (attempted.current === key) return
    attempted.current = key
    let active = true
    setFailed(false)
    void refresh(contact).catch(() => {
      // Keep the previous photo/initials; retry only on a later entry into view.
      if (active) setFailed(true)
    })
    return () => {
      active = false
    }
  }, [contact, connected, visible, refresh])

  return (
    <span
      ref={element}
      className="inline-flex shrink-0"
      title={failed ? 'Não foi possível atualizar a foto de perfil' : undefined}
    >
      <ContactAvatar
        initials={contactInitials(conversation.displayName)}
        avatarUrl={conversation.avatarUrl}
      />
    </span>
  )
}
