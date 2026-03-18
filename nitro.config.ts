import { defineNitroConfig } from "nitro/config";
import { provider } from "std-env";

export default defineNitroConfig({
  serverDir: ".",
  runtimeConfig: {
    GH_TOKEN: process.env.GH_TOKEN,
  },
  routeRules: {
    "/**": {
      cache:
        process.env.NODE_ENV === "production" ? { maxAge: 60 * 60 } : undefined,
      cors: true,
    },
    // Backward compatibility for changelogen
    "/user/find/**": { proxy: "/users/find/**" },
  },
  storage: {
    "/cache/gh":
      provider === "vercel"
        ? { driver: "vercel-runtime-cache" }
        : { driver: "memory" },
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
