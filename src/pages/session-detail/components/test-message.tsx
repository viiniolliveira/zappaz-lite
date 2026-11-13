'use client'

import { useAtom } from 'jotai'
import { Loader2Icon } from 'lucide-react'
import { useState } from 'react'
import { sendTestMessageAtom } from '@/atoms/message'
import { Button } from '@/components/ui/button'
import InputPhone from '@/components/ui/inputPhone'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { SessionSchema, TestMessageType } from '@/services/types'

export default function TestMessage({ session }: { session: SessionSchema }) {
  const [phone, setPhone] = useState('')
  const [filter, setFilter] = useState<TestMessageType>('text')
  const [{ isPending, mutate: sendTestMessage }] = useAtom(sendTestMessageAtom)

  const handleSendTestMessage = async () => {
    if (!phone) return
    sendTestMessage({
      sessionId: session.id,
      req: {
        number: phone,
        type: filter,
      },
    })
  }

  return (
    <>
      <div className="mb-6">
        <h2 className="font-semibold text-lg">Mensagem de teste</h2>
        <p className="text-xs text-muted-foreground">
          Envie uma mensagem de teste para o número informado.
        </p>
      </div>
      <div className="w-full flex items-center gap-4 flex-wrap">
        <div>
          <InputPhone value={phone} setValue={setPhone} />
        </div>
        <div className="grid gap-3">
          <Label htmlFor="test-message-type">Tipo de mensagem</Label>
          <Select
            value={filter}
            onValueChange={(value: string) => setFilter(value as TestMessageType)}
          >
            <SelectTrigger id="test-message-type" className="w-45">
              <SelectValue placeholder="Texto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="audio">Áudio</SelectItem>
              <SelectItem value="image">Imagem</SelectItem>
              <SelectItem value="video">Vídeo</SelectItem>
              <SelectItem value="document">Documento</SelectItem>
              <SelectItem value="contact">Contato</SelectItem>
              <SelectItem value="location">Localização</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid self-end">
          <Button
            className="w-20!"
            onClick={handleSendTestMessage}
            disabled={isPending || !phone}
            aria-label={isPending ? 'Enviando mensagem' : 'Enviar mensagem de teste'}
          >
            {isPending ? <Loader2Icon className="animate-spin" size={16} /> : 'Enviar'}
          </Button>
        </div>
      </div>
    </>
  )
}
