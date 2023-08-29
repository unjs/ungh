import { defineNitroConfig } from "nitropack/config";

export default defineNitroConfig({
  runtimeConfig: {
    GH_TOKEN: process.env.GH_TOKEN,
  },
  routeRules: {
    "/**": { cache: { maxAge: 60 }, cors: true },
    // Backward compatibility for changelogen
    "/user/find/**": { proxy: "/users/find/**" },
  },
  storage: {
    "/cache/gh": {
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
});
