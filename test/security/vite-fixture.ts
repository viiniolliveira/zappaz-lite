import config from '../../vite.config.ts'

export default {
  ...config,
  envDir: process.env.CSP_FIXTURE_DIR,
  build: {
    rollupOptions: {
      input: [
        'index.html',
        'test/security/components-fixture.html',
        'test/security/pdf-fixture.html',
      ],
    },
  },
}
