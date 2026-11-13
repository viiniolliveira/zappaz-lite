import { expect, test } from 'bun:test'
import { encodeVoiceAudio } from '../../server/src/modules/conversation-messages/voice-audio.ts'

const ffmpeg = Bun.which('ffmpeg')
const ffprobe = Bun.which('ffprobe')

for (const input of [
  { format: 'webm', options: ['-c:a', 'libopus'] },
  { format: 'ogg', options: ['-c:a', 'libopus'] },
  { format: 'mp4', options: ['-c:a', 'aac', '-movflags', 'frag_keyframe+empty_moov'] },
  { format: 'wav', options: [] },
]) {
  test.skipIf(!ffmpeg || !ffprobe)(`encodes ${input.format} audio as decodable mono MP3`, async () => {
    if (!ffmpeg || !ffprobe) throw new Error('ffmpeg and ffprobe required')
    const source = Bun.spawn([ffmpeg, '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.15', '-ac', '2', ...input.options, '-f', input.format, 'pipe:1'], { stdout: 'pipe', stderr: 'pipe' })
    const bytes = new Uint8Array(await new Response(source.stdout).arrayBuffer())
    expect(await source.exited).toBe(0)
    const output = await encodeVoiceAudio(bytes)
    const probe = Bun.spawn([ffprobe, '-v', 'error', '-show_entries', 'stream=codec_name,channels,sample_rate,bit_rate:format=format_name', '-of', 'json', 'pipe:0'], { stdin: new Blob([output]), stdout: 'pipe', stderr: 'pipe' })
    const info = await new Response(probe.stdout).json() as { streams: { codec_name: string; channels: number; sample_rate: string; bit_rate: string }[]; format: { format_name: string } }
    expect(await probe.exited).toBe(0)
    expect(info.streams[0]).toMatchObject({ codec_name: 'mp3', channels: 1, sample_rate: '48000', bit_rate: '128000' })
    expect(info.format.format_name).toBe('mp3')
    const decoder = Bun.spawn([ffmpeg, '-v', 'error', '-i', 'pipe:0', '-f', 's16le', 'pipe:1'], { stdin: new Blob([output]), stdout: 'pipe', stderr: 'pipe' })
    const pcm = await new Response(decoder.stdout).arrayBuffer()
    expect(await decoder.exited).toBe(0)
    expect(pcm.byteLength).toBeGreaterThan(0)
  }, 30000)
}

test.skipIf(!ffmpeg)('rejects corrupt and empty audio', async () => {
  await expect(encodeVoiceAudio(new TextEncoder().encode('not audio'))).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' })
  await expect(encodeVoiceAudio(new Uint8Array())).rejects.toMatchObject({ code: 'UNSUPPORTED_MEDIA_TYPE' })
}, 30000)
