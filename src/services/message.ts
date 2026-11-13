import { request } from '@/lib/api-client'
import type {
  SendAudioMessageRequest,
  SendContactMessageRequest,
  SendDocumentMessageRequest,
  SendImageMessageRequest,
  SendLocationMessageRequest,
  SendTestMessageRequest,
  SendTextMessageRequest,
  SendVideoMessageRequest,
} from './types'

const send = (sessionId: string, type: string, body: unknown) =>
  request(`/api/v1/session/${sessionId}/message/${type}`, { method: 'POST', body })

export const sendText = (sessionId: string, req: SendTextMessageRequest) =>
  send(sessionId, 'text', { ...req, linkPreview: req.linkPreview ?? true, delay: req.delay ?? 0 })
export const sendAudio = (sessionId: string, req: SendAudioMessageRequest) =>
  send(sessionId, 'audio', { ...req, asVoiceNote: req.asVoiceNote ?? false, delay: req.delay ?? 0 })
export const sendImage = (sessionId: string, req: SendImageMessageRequest) =>
  send(sessionId, 'image', req)
export const sendVideo = (sessionId: string, req: SendVideoMessageRequest) =>
  send(sessionId, 'video', { ...req, gifPlayback: req.gifPlayback ?? false })
export const sendDocument = (sessionId: string, req: SendDocumentMessageRequest) =>
  send(sessionId, 'document', req)
export const sendContact = (sessionId: string, req: SendContactMessageRequest) =>
  send(sessionId, 'contact', {
    number: req.number,
    contact: {
      firstName: req.firstName,
      lastName: req.lastName ?? '',
      phoneNumber: req.phoneNumber,
    },
  })
export const sendLocation = (sessionId: string, req: SendLocationMessageRequest) =>
  send(sessionId, 'location', {
    number: req.number,
    location: {
      degreesLatitude: req.degreesLatitude,
      degreesLongitude: req.degreesLongitude,
      name: req.name,
      address: req.address,
      url: req.url,
      comment: req.comment,
    },
  })

const testMessageSenders = {
  text: (sessionId: string, number: string) =>
    sendText(sessionId, {
      number,
      message: 'Esta é uma mensagem de teste enviada pela Zappaz.',
    }),
  audio: (sessionId: string, number: string) =>
    sendAudio(sessionId, {
      number,
      source: 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
    }),
  image: (sessionId: string, number: string) =>
    sendImage(sessionId, {
      number,
      source: 'https://placehold.co/800x600/png?text=Zappaz+Teste',
      caption: 'Imagem de teste enviada pela Zappaz.',
    }),
  video: (sessionId: string, number: string) =>
    sendVideo(sessionId, {
      number,
      source: 'https://samplelib.com/lib/preview/mp4/sample-5s.mp4',
      caption: 'Vídeo de teste enviado pela Zappaz.',
    }),
  document: (sessionId: string, number: string) =>
    sendDocument(sessionId, {
      number,
      source: 'aGVsbG8gZnJvbSB6YXBwYXo=',
      fileName: 'zappaz-teste.txt',
      caption: 'Documento de teste enviado pela Zappaz.',
    }),
  contact: (sessionId: string, number: string) =>
    sendContact(sessionId, {
      number,
      firstName: 'Contato',
      lastName: 'de teste Zappaz',
      phoneNumber: '5511999999999',
    }),
  location: (sessionId: string, number: string) =>
    sendLocation(sessionId, {
      number,
      name: 'Google São Paulo',
      address: 'Av. Brigadeiro Faria Lima 3477, São Paulo, SP, Brasil',
      url: 'www.google.com',
    }),
} satisfies Record<
  SendTestMessageRequest['type'],
  (sessionId: string, number: string) => Promise<unknown>
>

export const sendTestMessage = (sessionId: string, req: SendTestMessageRequest) =>
  testMessageSenders[req.type](sessionId, req.number)

export const message = {
  sendText,
  sendAudio,
  sendImage,
  sendVideo,
  sendDocument,
  sendContact,
  sendLocation,
  sendTestMessage,
}
