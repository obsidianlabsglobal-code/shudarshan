import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Relative asset paths: the dashboard is served from a sub-path on GitHub Pages
  // (/shudarshan/), so root-relative "/assets/..." would 404 there.
  base: "./",
  plugins: [react()],
  server: { fs: { allow: [".."] } },
});
