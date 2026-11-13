import { atom } from 'jotai'

// Ephemeral presence only: never persisted or merged into message history.
export const chatTypingAtom = atom<Record<string, boolean>>({})
