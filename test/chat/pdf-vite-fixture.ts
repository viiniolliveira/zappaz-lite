import { resolve } from 'node:path'
import config from '../../vite.config.ts'

export default {
  ...config,
  envDir: process.env.PDF_FIXTURE_DIR,
  build: { rollupOptions: { input: resolve('test/chat/pdf-browser.html') } },
}
