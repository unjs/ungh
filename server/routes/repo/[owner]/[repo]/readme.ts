import { ghFetch } from '~/utils/github'

export default cachedEventHandler(async (event) => {
  const repo = `${event.context.params.owner}/${event.context.params.repo}`
  const markdown = await $fetch(`https://raw.githubusercontent.com/${repo}/main/README.md`)
  const html = await ghFetch('/markdown', {
    method: 'POST',
    headers: {
      accept: 'application/vnd.github+json',
      'content-type': 'text/x-markdown'
    },
    body: JSON.stringify({
      text: markdown,
      context: repo
    })
  })
  return {
    html,
    markdown
  }
}, {
  group: 'gh',
  name: 'readme',
  swr: true,
  maxAge: 60 * 60 * 6, // 6 hours
  staleMaxAge: 60 * 60 * 12 // 12 hours
})
