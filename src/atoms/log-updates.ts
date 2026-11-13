import { atom } from 'jotai'
import { atomFamily } from 'jotai-family'

export const logRevisionAtom = atomFamily((_scope: string) => atom(0))
