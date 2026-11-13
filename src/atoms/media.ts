import { atom } from 'jotai'
import { atomWithQuery } from 'jotai-tanstack-query'
import { getMediaLimits } from '@/services/media'

export const mediaKeys = { limits: ['media', 'limits'] as const }
export const mediaLimitsAtom = atomWithQuery(() => ({
  queryKey: mediaKeys.limits,
  queryFn: ({ signal }) => getMediaLimits(signal),
  staleTime: Number.POSITIVE_INFINITY,
  retry: false,
}))
export const mediaMaxFileSizeBytesAtom = atom(
  (get) => get(mediaLimitsAtom).data?.maxFileSizeBytes ?? null,
)
