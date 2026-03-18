import { defineRouteMeta, defineHandler, html } from "nitro";
import { getQuery } from "nitro/h3";

import { renderHTML } from "openapi-renderer";

defineRouteMeta({
  openAPI: {
    description: "API documentation for Ungh.",
  },
});

export default defineHandler((event) => {
  return html(
    renderHTML({
      renderer: (getQuery(event).renderer as any) || "scalar",
      spec: "/openapi.json",
      meta: {
        title: "ungh.cc | Unlimited access to GitHub API",
      },
      scalar: {
        hideClientButton: true,
        theme: "alternate",
        _integration: "nitro",
      },
    }),
  );
});
