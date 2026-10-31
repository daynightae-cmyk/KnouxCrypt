import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: "0.0.0.0",
  },

  // Relative base is required for the packaged Electron renderer, which is
  // loaded over file:// and cannot resolve absolute /assets/* URLs.
  base: "./",
  define: {
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  optimizeDeps: {
    include: ["buffer"],
  },
  build: {
    ...{
      outDir: "build",
      assetsDir: "assets",
      rollupOptions: {
        output: {
          // Rolldown (Vite 8) requires manualChunks to be a function.
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("react-router")) return "router";
            if (id.includes("react-dom") || id.includes("/react/")) return "vendor";
            return undefined;
          },
        },
      },
    },
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{js,ts}"],
    globals: true,
  },
});
