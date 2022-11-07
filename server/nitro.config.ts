import { defineNitroConfig } from 'nitropack'

export default defineNitroConfig({
  runtimeConfig: {
    GH_TOKEN: process.env.GH_TOKEN
  },
  routeRules: {
    '/gh/**': { cache: { maxAge: 60 } }
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
