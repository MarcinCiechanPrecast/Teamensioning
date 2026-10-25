// @ts-check
import { defineConfig, envField, fontProviders } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
  adapter: cloudflare(),
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Outfit",
      cssVariable: "--font-outfit",
      weights: ["400 700"],
      fallbacks: ["sans-serif"],
    },
  ],
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
