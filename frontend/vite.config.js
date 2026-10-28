import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // This is a repository Pages site at /cinefind/, not the account root URL.
  base: "/cinefind/",
  plugins: [react(), tailwindcss()],
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: {
        main: resolve(projectRoot, "index.html"),
        mood: resolve(projectRoot, "mood.html"),
      },
    },
  },
});
