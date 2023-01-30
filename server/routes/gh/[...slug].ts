import { ghFetch } from '~/utils/github'

export default eventHandler(async (event) => {
  const result = await ghFetch(event.context.params.slug || '')

  return {
    result
  }
})
