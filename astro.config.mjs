import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";
import node from "@astrojs/node";
import db from "@astrojs/db";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [svelte(), db()],
  vite: {
    plugins: [tailwindcss()]
  }
});