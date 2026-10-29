import { defineConfig } from "nitro";
import { provider, isProduction } from "std-env";

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
    "/**": {
      // 6 hours in production, no cache in development
      isr: isProduction ? 60 * 60 * 6 : false,
      cors: true,
      headers: isProduction ? { "access-control-max-age": "21600" } : {}, // 6 hours
    },
    // Backward compatibility for changelogen
    "/user/find/**": { proxy: "/users/find/**" },
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
