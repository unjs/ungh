import { defineNitroConfig } from 'nitropack'

export default defineNitroConfig({
  runtimeConfig: {
    GH_TOKEN: process.env.GH_TOKEN
  },
  routeRules: {
    '/**': { cache: { maxAge: 60 }, cors: true }
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
