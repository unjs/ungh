/**
 * Source: https://github.com/nitrojs/nitro/blob/main/src/runtime/internal/routes/openapi.ts
 * (temporary fork)
 */

import { defineHandler } from "nitro";
import { defu } from "defu";

// @ts-ignore
import { handlersMeta } from "#nitro/virtual/routing-meta";

import { useRuntimeConfig } from "nitro/runtime-config";

const runtimeConfig = useRuntimeConfig();

export default defineHandler((event) => {
  const url = new URL("/", event.url);
  const meta = {
    title: "UNGH API",
    ...runtimeConfig.nitro?.openAPI?.meta,
  };
  const {
    paths,
    globals: { components, ...globalsRest },
  } = getHandlersMeta() as any;
  const extensible = Object.fromEntries(
    Object.entries(globalsRest).filter(([key]) => key.startsWith("x-")),
  );
  return {
    openapi: "3.1.0",
    info: {
      title: meta?.title,
      version: meta?.version,
      description: meta?.description,
    },
    servers: [{ url }],
    paths,
    components,
    ...extensible,
  };
});
function getHandlersMeta() {
  const paths: Record<string, any> = {};
  let globals = {};
  for (const h of handlersMeta) {
    const { route, parameters } = normalizeRoute(h.route || "");
    if (route === "/" || route.startsWith("/_") || route.endsWith(".json")) {
      continue; // Skip internal routes
    }
    const tags: string[] = [];
    const method = (h.method || "get").toLowerCase();
    const { $global, ...openAPI } = h.meta?.openAPI || {};
    const item = {
      [method]: {
        tags,
        parameters,
        responses: {
          200: { description: "OK" },
        },
        ...openAPI,
      },
    };
    if (item[method].tags?.includes("hidden")) {
      continue; // Skip hidden routes
    }
    if ($global) {
      globals = defu($global, globals);
    }
    if (paths[route] === void 0) {
      paths[route] = item;
    } else {
      Object.assign(paths[route], item);
    }
  }
  return { paths, globals };
}

function normalizeRoute(_route: string) {
  const parameters: { name: string; in: string; required: boolean; schema: { type: string } }[] =
    [];
  let anonymousCtr = 0;
  const route = _route
    .replace(/:(\w+)/g, (_, name) => `{${name}}`)
    .replace(/\/(\*)\//g, () => `/{param${++anonymousCtr}}/`)
    .replace(/\*\*{/, "{")
    .replace(/\/(\*\*)$/g, () => `/{*param${++anonymousCtr}}`);
  const paramMatches = route.matchAll(/{(\*?\w+)}/g);
  for (const match of paramMatches) {
    const name = match[1]!;
    if (!parameters.some((p) => p.name === name)) {
      parameters.push({
        name,
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
  }
  return {
    route,
    parameters,
  };
}
