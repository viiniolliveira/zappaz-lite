import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'
import { toast } from 'sonner'

export default function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: () => {
      toast.error(
        'Não foi possível preparar a instalação do aplicativo. Tente recarregar mais tarde.',
      )
    },
  })

  useEffect(() => {
    if (!needRefresh) return
    toast('Nova versão disponível', {
      id: 'pwa-update',
      description: 'Atualize quando puder recarregar o app sem interromper seu trabalho.',
      duration: Infinity,
      action: {
        label: 'Atualizar agora',
        onClick: () => {
          void updateServiceWorker(true).catch(() => {
            toast.error(
              'Não foi possível atualizar. Recarregue o aplicativo para tentar novamente.',
            )
          })
        },
      },
      cancel: { label: 'Depois', onClick: () => setNeedRefresh(false) },
    })
    return () => {
      toast.dismiss('pwa-update')
    }
  }, [needRefresh, setNeedRefresh, updateServiceWorker])

  return null
}
