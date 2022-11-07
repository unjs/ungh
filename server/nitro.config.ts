import { defineNitroConfig } from 'nitropack'

export default defineNitroConfig({
  runtimeConfig: {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN
  },
  storage: {
    '/cache/gh': {
      driver: 'cloudflare-kv-binding',
      binding: 'UNGH_CACHE'
    }
  },
  devStorage: {
    '/cache/gh': {
      driver: 'fs',
      base: './.cache/gh'
    }
  }
})
