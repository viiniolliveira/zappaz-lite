import { spawn } from 'bun'
import { AppError } from '../../common/errors/app-error.ts'
import { config } from '../../config.ts'
import { acquireMediaProcessing } from '../../lib/resource-limit.ts'

/** Encode browser recordings as MP3 for playback as regular WhatsApp audio (ptt: false). */
export async function encodeVoiceAudio(input: Uint8Array): Promise<Buffer> {
  const release = acquireMediaProcessing()
  try {
    return await encode(input)
  } finally {
    release()
  }
}

async function encode(input: Uint8Array): Promise<Buffer> {
  let process: ReturnType<typeof spawn>
  try {
    process = spawn({
      cmd: [
        'ffmpeg',
        '-hide_banner',
        '-loglevel',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'pipe',
        '-i',
        'pipe:0',
        '-map',
        '0:a:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '48000',
        '-c:a',
        'libmp3lame',
        '-b:a',
        '128k',
        '-f',
        'mp3',
        'pipe:1',
      ],
      stdin: new Blob([new Uint8Array(input)]),
      stdout: 'pipe',
      stderr: 'ignore',
    })
  } catch (cause) {
    throw new AppError({
      status: 503,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Voice recording requires FFmpeg on the server',
      cause,
    })
  }
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    process.kill('SIGKILL')
  }, 30_000)
  try {
    const chunks: Uint8Array[] = []
    let size = 0
    if (typeof process.stdout === 'number' || !process.stdout)
      throw new Error('Missing encoder output')
    for await (const chunk of process.stdout) {
      size += chunk.byteLength
      if (size > config.mediaMaxFileSizeBytes) {
        throw new AppError({
          status: 413,
          code: 'PAYLOAD_TOO_LARGE',
          message: `Encoded voice note exceeds ${config.mediaMaxFileSizeMb} MiB`,
        })
      }
      chunks.push(chunk)
    }
    const code = await process.exited
    if (timedOut || code !== 0 || size === 0) {
      throw new AppError({
        status: 415,
        code: 'UNSUPPORTED_MEDIA_TYPE',
        message: timedOut ? 'Audio encoding timed out' : 'Could not decode the audio recording',
      })
    }
    return Buffer.concat(chunks)
  } finally {
    clearTimeout(timeout)
    if (process.exitCode === null) process.kill('SIGKILL')
    await process.exited
  }
}
