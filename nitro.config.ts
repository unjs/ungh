import { defineConfig } from "nitro";
import { provider } from "std-env";

export default defineConfig({
  serverDir: ".",
  runtimeConfig: {
    GH_TOKEN: process.env.GH_TOKEN,
    GH_APP_ID: process.env.GH_APP_ID,
    GH_APP_PRIVATE_KEY: process.env.GH_APP_PRIVATE_KEY,
  },
  rolldownConfig: {
    tsconfig: true,
  },
  routeRules: {
    "/**": { cors: true },
    // Backward compatibility for changelogen
    "/user/find/**": { proxy: "/users/find/**" },
  },
  // Applied on `nitro build` regardless of NODE_ENV (no cache in development)
  $production: {
    routeRules: {
      "/**": {
        isr: 60 * 60 * 6, // 6 hours
        headers: { "access-control-max-age": "21600" }, // 6 hours
      },
      // Auth-protected and live: ISR would cache authenticated responses for everyone
      "/_status": { isr: false },
      "/_metrics": { isr: false },
    },
  },
  kv: {
    "/cache": provider === "vercel" ? { driver: "vercel-runtime-cache" } : { driver: "memory" },
    "/redis": provider === "vercel" ? { driver: "upstash" } : { driver: "memory" },
  },
  $development: {
    kv: {
      "/cache/gh": {
        driver: "memory",
        // driver: "fs",
        // base: "./.cache/gh",
      },
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
