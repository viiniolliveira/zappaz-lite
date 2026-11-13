import { fileURLToPath, URL } from 'node:url'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// https://vite.dev/config/
export default defineConfig({
  envPrefix: [],
  server: {
    proxy: {
      '^/api(?:/|$)': { target: 'http://localhost:3001', ws: true },
      '/admin': { target: 'http://localhost:3001' },
      '/mcp': { target: 'http://localhost:3001' },
      '/health': { target: 'http://localhost:3001' },
      '/docs': { target: 'http://localhost:3001' },
      '/openapi.json': { target: 'http://localhost:3001' },
    },
  },
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    viteStaticCopy({
      targets: ['cmaps', 'standard_fonts', 'wasm'].map((directory) => ({
        src: fileURLToPath(new URL(`./node_modules/pdfjs-dist/${directory}`, import.meta.url)),
        dest: `pdfjs/${directory}`,
        rename: { stripBase: true },
      })),
    }),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.ico', 'icons/*.png', 'offline.html'],
      manifest: {
        id: '/',
        name: 'Zappaz Lite',
        short_name: 'Zappaz',
        description: 'Suas conversas e sessões do WhatsApp em um só lugar.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#fafafa',
        theme_color: '#fafafa',
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Never precache the app document or authenticated responses.
        globPatterns: ['assets/**/*.{js,css,woff2}'],
        navigateFallback: null,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /^\/(api|admin|mcp)(\/|$)/.test(url.pathname),
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request, url, sameOrigin }) =>
              request.mode === 'navigate' &&
              sameOrigin &&
              !/^\/(api|admin|health|mcp|docs|assets|themes|icons)(\/|$)/.test(url.pathname) &&
              !/\/[^/]*\.[^/]+$/.test(url.pathname),
            handler: 'NetworkOnly',
            options: { precacheFallback: { fallbackURL: '/offline.html' } },
          },
        ],
      },
    }),
  ],
})
