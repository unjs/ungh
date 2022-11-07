import { defineNitroConfig } from 'nitropack'

export default defineNitroConfig({
  runtimeConfig: {
    GITHUB_TOKEN: process.env.GITHUB_TOKEN
  }
})
