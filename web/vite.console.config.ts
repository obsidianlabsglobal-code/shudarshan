// Build config for the local Sudarshan console (served by `sudarshan serve`).
// Separate from the dashboard build so the dashboard / GitHub Pages output is unchanged.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-console",
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL("./console.html", import.meta.url)) },
  },
  // `npm run dev:console` for UI iteration; API calls go to a running `sudarshan serve`.
  server: { port: 5174, proxy: { "/api": "http://127.0.0.1:4545" } },
});
