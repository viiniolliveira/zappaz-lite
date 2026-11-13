import { useAtomValue, useSetAtom } from 'jotai'
import { useEffect } from 'react'
import { chatAccessDeniedAtom } from '@/atoms/chat-cache'
import {
  chatContactQueryAtom,
  chatContactSearchAtom,
  chatConversationQueryAtom,
  chatConversationSearchAtom,
  chatSessionIdAtom,
} from '@/atoms/ui'
import { useDebounce } from '@/hooks/use-debounce'

function SessionSearchSync() {
  const contactSearch = useAtomValue(chatContactSearchAtom)
  const conversationSearch = useAtomValue(chatConversationSearchAtom)
  const contactQuery = useDebounce(contactSearch)
  const conversationQuery = useDebounce(conversationSearch)
  const setContactQuery = useSetAtom(chatContactQueryAtom)
  const setConversationQuery = useSetAtom(chatConversationQueryAtom)

  useEffect(() => {
    setContactQuery(contactQuery)
  }, [contactQuery, setContactQuery])
  useEffect(() => {
    setConversationQuery(conversationQuery)
  }, [conversationQuery, setConversationQuery])
  useEffect(
    () => () => {
      setContactQuery('')
      setConversationQuery('')
    },
    [setContactQuery, setConversationQuery],
  )

  return null
}

export default function ChatSearchSync() {
  const sessionId = useAtomValue(chatSessionIdAtom)
  const denied = useAtomValue(chatAccessDeniedAtom)
  return sessionId && !denied ? <SessionSearchSync key={sessionId} /> : null
}
