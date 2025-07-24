import { defineNitroConfig } from "nitropack/config";
import { provider } from "std-env";

export default defineNitroConfig({
  compatibilityDate: "2025-07-23",
  runtimeConfig: {
    GH_TOKEN: process.env.GH_TOKEN,
  },
  routeRules: {
    "/**": {
      cache: process.env.NODE_ENV === "production" ? { maxAge: 60 } : undefined,
      cors: true,
    },
    // Backward compatibility for changelogen
    "/user/find/**": { proxy: "/users/find/**" },
  },
  storage: {
    "/cache/gh":
      provider === "vercel"
        ? {
            // UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are used by default
            driver: "upstash",
          }
        : {
            driver: "cloudflare-kv-binding",
            binding: "UNGH_CACHE",
          },
  },
  devStorage: {
    "/cache/gh": {
      driver: "fs",
      base: "./.cache/gh",
    },
  },
  experimental: {
    openAPI: true,
  },
  openAPI: {
    meta: {
      title: "🐙 ungh.cc",
      description: `Unlimited access to GitHub API. <br><br> ⭐ [Star on GitHub](https://github.com/unjs/ungh) <br> 💛 Hosting sponsored by [Vercel](https://vercel.com/?utm_source=ungh)`,
      version: "1.0.0",
    },
  },
});
