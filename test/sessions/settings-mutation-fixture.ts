import { atom } from 'jotai'

export const requests: unknown[] = []
export let shouldFail = false
export function setFailure(value: boolean) {
  shouldFail = value
}

export const updateSessionAtom = atom({
  isPending: false,
  mutate: (variables: unknown, options: { onSuccess?: () => void }) => {
    requests.push(structuredClone(variables))
    if (!shouldFail) options.onSuccess?.()
  },
})
