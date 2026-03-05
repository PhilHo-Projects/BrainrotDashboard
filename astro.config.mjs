import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import node from "@astrojs/node";
import db from "@astrojs/db";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  security: {
    checkOrigin: false
  },
  base: '/BrainrotDashboard',
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [svelte(), db()],
  vite: {
    plugins: [tailwindcss()]
  }
});