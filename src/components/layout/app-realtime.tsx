import { useAtomValue } from 'jotai'
import { Navigate } from 'react-router'
import { appConnectionStatusAtom, realtimeAppEffectAtom } from '@/atoms/realtime-app'

export default function AppRealtime() {
  useAtomValue(realtimeAppEffectAtom)
  const status = useAtomValue(appConnectionStatusAtom)
  return status === 'unauthorized' ? <Navigate to="/sign-in" replace /> : null
}
