import { renderHTML } from "openapi-renderer";
import { getQuery } from "h3";

defineRouteMeta({
  openAPI: {
    description: "API documentation for Ungh.",
  },
});

export default eventHandler((event) =>
  renderHTML({
    renderer: (getQuery(event).renderer as any) || "scalar",
    spec: "/openapi.json",
    meta: {
      title: "🐙 ungh.cc | Unlimited access to GitHub API",
    },
    scalar: {
      hideClientButton: true,
      theme: "alternate",
      _integration: "nitro",
    },
  }),
);
