import { defineNitroConfig } from "nitro/config";
import { provider, isProduction } from "std-env";

export default defineNitroConfig({
  serverDir: ".",
  runtimeConfig: {
    GH_TOKEN: process.env.GH_TOKEN,
    GH_APP_ID: process.env.GH_APP_ID,
    GH_APP_PRIVATE_KEY: process.env.GH_APP_PRIVATE_KEY,
  },
  routeRules: {
    "/**": {
      // 6 hours in production, no cache in development
      isr: isProduction ? 60 * 60 * 6 : false,
      cors: true,
      headers: { "access-control-max-age": "21600" }, // 6 hours
    },
    "/_status": {
      cache: false,
      basicAuth: parseBasicAuth(process.env.STATUS_AUTH) || false,
    },
    "/_metrics": {
      cache: false,
      basicAuth: parseBasicAuth(process.env.STATUS_AUTH) || false,
    },
    // Backward compatibility for changelogen
    "/user/find/**": { proxy: "/users/find/**" },
  },
  storage: {
    "/cache": provider === "vercel" ? { driver: "vercel-runtime-cache" } : { driver: "memory" },
    "/redis": provider === "vercel" ? { driver: "upstash" } : { driver: "memory" },
  },
  devStorage: {
    "/cache/gh": {
      driver: "memory",
      // driver: "fs",
      // base: "./.cache/gh",
    },
  },
  experimental: {
    openAPI: true,
  },
  openAPI: {
    meta: {
      title: "🐙 ungh.cc",
      description: `Unlimited access to GitHub API. <br><br> <div align="center"> <img src="/_thanks?1" alt="Sponsors" /> <br><br> ⭐ [Star on GitHub](https://github.com/unjs/ungh) <br> 💛 Hosting sponsored by [Vercel](https://vercel.com/?utm_source=ungh) </div>`,
      version: "1.0.0",
    },
  },
});

function parseBasicAuth(auth?: string) {
  if (!auth) return undefined;
  const [username, ...rest] = auth.split(":");
  return { username, password: rest.join(":") };
}
