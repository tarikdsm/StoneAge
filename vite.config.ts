import { defineConfig } from 'vite'

const repoBasePath = '/StoneAge/'

export default defineConfig({
  base: repoBasePath,
  build: {
    chunkSizeWarningLimit: 1500
  },
  server: {
    host: '0.0.0.0',
    port: 3000
  },
  preview: {
    host: '0.0.0.0',
    port: 4173
  }
})
