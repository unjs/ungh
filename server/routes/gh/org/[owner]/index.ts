import type { GithubOrg } from '~types'
import { ghFetch } from '~/utils/github'
import { apiResponse } from '~/utils/response'

export default eventHandler(async (event) => {
  const org = await ghFetch(`orgs/${event.context.params.owner}`)

  return apiResponse(event, {
    org: <GithubOrg> {
      id: org.id,
      name: org.name,
      description: org.description
    }
  })
})
