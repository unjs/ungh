import type { H3Event } from 'h3'

export function apiResponse (event: H3Event, resp: any) {
  return {
    ...resp,
    meta: {
      generatedAt: new Date().toISOString(),
      url: 'https://ungh.unjs.io' + event.req.url
    }
  }
}
