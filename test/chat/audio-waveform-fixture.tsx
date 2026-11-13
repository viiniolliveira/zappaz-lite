import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { useAudioWaveform } from '../../src/hooks/use-audio-waveform'

function wav(): Blob {
  const samples = 8000
  const bytes = new ArrayBuffer(44 + samples * 2)
  const view = new DataView(bytes)
  const text = (offset: number, value: string) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)))
  text(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE'); text(12, 'fmt ')
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true)
  view.setUint32(24, 8000, true); view.setUint32(28, 16000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true)
  text(36, 'data'); view.setUint32(40, samples * 2, true)
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, i < samples / 2 ? 8192 : -16384, true)
  return new Blob([bytes], { type: 'audio/wav' })
}

type Result = ReturnType<typeof useAudioWaveform>
let latest: Result | undefined
function Probe({ blob }: { blob: Blob | null }) {
  latest = useAudioWaveform(blob)
  return null
}
const waitFor = async (predicate: () => boolean) => {
  for (let i = 0; i < 10000; i++) {
    if (predicate()) return
    await new Promise(resolve => setTimeout(resolve, 20))
  }
  throw new Error('Timed out waiting for waveform: ' + JSON.stringify({ duration: latest?.duration, error: latest?.error?.message, peaks: latest?.peaks?.length }))
}
async function run() {
  const root = createRoot(document.getElementById('root')!)
  let requests = 0
  window.fetch = () => { requests++; return Promise.reject(new Error('Unexpected network request')) }
  const blob = wav()
  root.render(createElement(Probe, { blob }))
  await waitFor(() => !!latest?.peaks)
  if (!latest?.peaks || Math.abs(latest.duration - 1) > 0.01 || latest.peaks.length !== 160 || Math.abs(latest.peaks[0] / latest.peaks[159] - 0.5) > 0.03 || Math.max(...latest.peaks) !== 1) throw new Error('Incorrect WAV peaks or duration: ' + JSON.stringify({duration: latest?.duration, length: latest?.peaks?.length, first: latest?.peaks?.[0], last: latest?.peaks?.[159]}))
  root.render(createElement(Probe, { blob: null }))
  await waitFor(() => latest?.peaks === null && latest.duration === 0)
  root.render(createElement(Probe, { blob: new Blob(['invalid audio']) }))
  await waitFor(() => !!latest?.error)
  if (latest?.peaks !== null || requests !== 0) throw new Error('Invalid audio or unexpected request')
  root.render(createElement(Probe, { blob: wav() }))
  root.unmount()
  document.body.textContent = JSON.stringify({ ok: true, requests })
}
run().catch(error => { document.body.textContent = JSON.stringify({ ok: false, error: String(error) }) })
