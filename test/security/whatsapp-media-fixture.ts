import assert from 'node:assert/strict'
import { createCipheriv, createHmac } from 'node:crypto'
import { getMediaKeys, getUrlFromDirectPath, type WAMessage } from 'baileys'
import { downloadWhatsappMedia } from '../../server/src/lib/whatsapp-media-download.ts'

const key = Buffer.alloc(32, 42)
const url = 'https://media.example.test/file'
const limit = (process.argv[2] === 'custom-size' ? 1 : 25) * 1024 * 1024
const types = ['image', 'video', 'audio', 'sticker', 'document'] as const
type MediaType = (typeof types)[number]
function message(type: MediaType = 'image', extra: Record<string, unknown> = {}): WAMessage {
  return {
    key: { id: 'message' },
    message: { [`${type}Message`]: { mediaKey: key, url, ...extra } },
  } as WAMessage
}
async function encrypt(data: Buffer, type: MediaType | 'thumbnail-link' = 'image') {
  const { cipherKey, iv, macKey } = await getMediaKeys(key, type)
  const cipher = createCipheriv('aes-256-cbc', cipherKey, iv)
  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()])
  assert.ok(macKey)
  const mac = createHmac('sha256', macKey).update(iv).update(ciphertext).digest().subarray(0, 10)
  return Buffer.concat([ciphertext, mac])
}
let data = await encrypt(Buffer.from('hello'))
let calls: { url: string; init?: RequestInit }[] = []
let handler: () => Promise<Response> = async () => new Response(data)
const originalFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  calls.push({ url: String(input), init })
  return handler()
}) as typeof fetch
const noRetry = async () => {
  throw new Error('unexpected reupload')
}
try {
  switch (process.argv[2]) {
    case 'valid': {
      for (const type of types) {
        const plain = Buffer.from(`payload ${type}`)
        data = await encrypt(plain, type)
        assert.deepEqual(await downloadWhatsappMedia(message(type), noRetry), plain)
      }
      assert.equal(calls.length, types.length)
      data = await encrypt(Buffer.from('hello'))
      await downloadWhatsappMedia(
        message('image', { directPath: '/v/file', url: 'https://cdn.example.test/old' }),
        noRetry,
      )
      assert.equal(calls.at(-1)?.url, getUrlFromDirectPath('/v/file', 'cdn.example.test'))
      await downloadWhatsappMedia(message('image', { directPath: '/v/file', url: null }), noRetry)
      assert.equal(calls.at(-1)?.url, getUrlFromDirectPath('/v/file', undefined))
      break
    }
    case 'destinations': {
      for (const unsafe of [
        'http://127.0.0.1/file',
        'http://169.254.169.254/latest/meta-data',
        'http://[::1]/file',
        'http://[fc00::1]/file',
        'http://2130706433/file',
        'https://user:password@media.example.test/file',
        'file:///etc/passwd',
        'ftp://media.example.test/file',
      ]) {
        calls = []
        await assert.rejects(
          downloadWhatsappMedia(message('image', { url: unsafe }), noRetry),
          /Outbound destination is not permitted/,
        )
        assert.equal(calls.length, 0, unsafe)
      }
      for (const unsafe of ['http://127.0.0.1/old', 'http://[::1]/old', 'http://2130706433/old']) {
        calls = []
        await assert.rejects(
          downloadWhatsappMedia(message('image', { url: unsafe, directPath: '/v/file' }), noRetry),
          /Outbound destination is not permitted/,
        )
        assert.equal(calls.length, 0, unsafe)
      }
      // A directPath uses the URL's host, not its scheme, credentials or path.
      calls = []
      assert.deepEqual(
        await downloadWhatsappMedia(
          message('image', { url: 'ftp://user:pass@cdn.example.test/old', directPath: '/v/file' }),
          noRetry,
        ),
        Buffer.from('hello'),
      )
      assert.equal(calls[0]?.url, 'https://cdn.example.test/v/file')
      await downloadWhatsappMedia(
        message('image', { url: 'not a URL', directPath: '/v/file' }),
        noRetry,
      )
      assert.equal(calls[1]?.url, 'https://mmg.whatsapp.net/v/file')
      // Rejections must not exhaust the shared four-slot capacity.
      for (let i = 0; i < 5; i++) {
        await assert.rejects(
          downloadWhatsappMedia(message('image', { url: 'http://127.0.0.1/' }), noRetry),
        )
      }
      assert.deepEqual(await downloadWhatsappMedia(message(), noRetry), Buffer.from('hello'))
      const unsupported = { key: { id: 'text' }, message: { conversation: 'hello' } } as WAMessage
      await assert.rejects(downloadWhatsappMedia(unsupported, noRetry), /not a media message/)
      break
    }
    case 'wrapped-and-thumbnail': {
      for (const wrapper of ['ephemeralMessage', 'viewOnceMessage']) {
        const wrapped = (inner: WAMessage): WAMessage =>
          ({
            key: inner.key,
            message: { [wrapper]: { message: inner.message } },
          }) as WAMessage
        calls = []
        await assert.rejects(
          downloadWhatsappMedia(
            wrapped(message('image', { url: 'http://127.0.0.1/file' })),
            noRetry,
          ),
          /Outbound destination is not permitted/,
        )
        assert.equal(calls.length, 0)
        assert.deepEqual(
          await downloadWhatsappMedia(wrapped(message()), noRetry),
          Buffer.from('hello'),
        )
        assert.equal(calls[0]?.url, url)
      }
      data = await encrypt(Buffer.from('thumbnail'), 'thumbnail-link')
      const thumbnail = {
        key: { id: 'thumbnail' },
        message: { extendedTextMessage: { thumbnailDirectPath: '/thumbnail', mediaKey: key } },
      } as WAMessage
      calls = []
      assert.deepEqual(await downloadWhatsappMedia(thumbnail, noRetry), Buffer.from('thumbnail'))
      assert.equal(calls[0]?.url, 'https://mmg.whatsapp.net/thumbnail')
      break
    }
    case 'unsafe-reupload': {
      let retries = 0
      handler = async () => {
        throw Object.assign(new Error('expired'), { status: 410 })
      }
      await assert.rejects(
        downloadWhatsappMedia(message(), async () => {
          retries++
          return message('image', { url: 'http://169.254.169.254/old', directPath: '/new' })
        }),
        /Outbound destination is not permitted/,
      )
      assert.equal(retries, 1)
      assert.deepEqual(
        calls.map((call) => call.url),
        [url],
      )
      handler = async () => new Response(data)
      assert.deepEqual(await downloadWhatsappMedia(message(), noRetry), Buffer.from('hello'))
      break
    }
    case 'retry-404':
    case 'retry-410': {
      for (const status of [Number(process.argv[2].slice(6))]) {
        calls = []
        let retries = 0
        handler = async () => {
          if (calls.length === 1) throw Object.assign(new Error('http error'), { status })
          return new Response(data)
        }
        const initial = message()
        assert.deepEqual(
          await downloadWhatsappMedia(initial, async (received) => {
            assert.equal(received, initial)
            retries++
            return message('image', { url: 'https://second.example.test/a' })
          }),
          Buffer.from('hello'),
        )
        assert.equal(retries, 1)
        assert.deepEqual(
          calls.map((call) => call.url),
          [url, 'https://second.example.test/a'],
        )
        calls = []
        retries = 0
        handler = async () => {
          throw Object.assign(new Error('http error'), { status })
        }
        await assert.rejects(
          downloadWhatsappMedia(initial, async () => {
            retries++
            return message()
          }),
        )
        assert.equal(retries, 1)
        assert.equal(calls.length, 2)
        calls = []
        retries = 0
        await assert.rejects(
          downloadWhatsappMedia(initial, async () => {
            retries++
            throw new Error('reupload failed')
          }),
          /reupload failed/,
        )
        assert.equal(retries, 1)
        assert.equal(calls.length, 1)
      }
      break
    }
    case 'errors': {
      for (const status of [301, 302, 307, 308, 400, 403, 404, 410, 500]) {
        calls = []
        let retries = 0
        handler = async () =>
          new Response(null, { status, headers: { location: 'http://127.0.0.1/redirect' } })
        await assert.rejects(
          downloadWhatsappMedia(message(), async () => {
            retries++
            return message()
          }),
          (error: unknown) => {
            if (status >= 400)
              assert.equal((error as { output: { statusCode: number } }).output.statusCode, status)
            else assert.ok(error instanceof Error)
            return true
          },
        )
        assert.equal(retries, 0)
        assert.equal(calls.length, 1)
      }
      handler = async () => {
        throw new Error('network failed')
      }
      await assert.rejects(downloadWhatsappMedia(message(), noRetry), /network failed/)
      await assert.rejects(downloadWhatsappMedia(message('image', { url: null }), noRetry))
      break
    }
    case 'size':
    case 'custom-size': {
      for (const size of [limit, limit + 1]) {
        data = await encrypt(Buffer.alloc(size, 7))
        if (size === limit)
          assert.equal((await downloadWhatsappMedia(message(), noRetry)).length, limit)
        else await assert.rejects(downloadWhatsappMedia(message(), noRetry), new RegExp(`${limit / 1024 / 1024} MiB`))
      }
      data = await encrypt(Buffer.from('hello'))
      assert.deepEqual(await downloadWhatsappMedia(message(), noRetry), Buffer.from('hello'))
      break
    }
    case 'concurrency': {
      let release!: () => void
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let entered = 0
      let ready!: () => void
      const allEntered = new Promise<void>((resolve) => {
        ready = resolve
      })
      handler = async () => {
        entered++
        if (entered === 4) ready()
        await gate
        return new Response(null, { status: 500 })
      }
      const running = Array.from({ length: 4 }, () => downloadWhatsappMedia(message(), noRetry))
      const settled = Promise.allSettled(running)
      await allEntered
      try {
        await assert.rejects(downloadWhatsappMedia(message(), noRetry), /capacity/i)
        assert.equal(entered, 4)
      } finally {
        release()
      }
      assert.ok((await settled).every((result) => result.status === 'rejected'))
      handler = async () => new Response(data)
      assert.deepEqual(await downloadWhatsappMedia(message(), noRetry), Buffer.from('hello'))
      break
    }
    default:
      throw new Error('unknown scenario')
  }
} finally {
  globalThis.fetch = originalFetch
}
