// SCREENSHOT-RECOVERED APPROXIMATION. Not yet byte-accurate or build verified.
// Screenshot 126 shows these imports, SPA/SSG settings, static-loader aliases, and src alias.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import path from "path";

function addCanonicalPathAliasesToStaticLoaderManifests(distDirectory: string) {
  for (const fileName of readdirSync(distDirectory)) {
    if (
      !fileName.startsWith("static-loader-data-manifest-") ||
      !fileName.endsWith(".json")
    ) {
      continue;
    }

    const manifestPath = path.resolve(distDirectory, fileName);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest === null || Array.isArray(manifest) || typeof manifest !== "object") {
      throw new Error("Static loader data manifest must contain a JSON object");
    }

    let changed = false;
    for (const [routePath, loaderData] of Object.entries(manifest)) {
      // Historical Anima manifest route aliases for deep-link SPA fallback.
      if (
        routePath.startsWith("/") ||
        routePath.startsWith("?") ||
        /[?\/]/.test(routePath)
      ) {
        continue;
      }

      const browserPath = new URL(routePath, "https://anima.invalid").pathname;
      const publishedPath = routePath
        .split("/")
        .map((segment) =>
          encodeURIComponent(segment).replace(
            /[!'()*]/g,
            (character) =>
              "%" + character.charCodeAt(0).toString(16).toUpperCase(),
          ),
        )
        .join("/");

      for (const aliasPath of [browserPath, publishedPath]) {
        if (
          !aliasPath ||
          aliasPath === routePath ||
          Object.prototype.hasOwnProperty.call(manifest, aliasPath)
        ) {
          continue;
        }
        manifest[aliasPath] = loaderData;
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(manifestPath, JSON.stringify(manifest));
    }
  }
}

export default defineConfig({
  plugins: [react()],
  publicDir: "./static",
  base: "./",
  ssgOptions: {
    containerId: "app",
    dirStyle: "nested",
    onFinished() {
      const distDirectory = path.resolve(__dirname, "dist");
      addCanonicalPathAliasesToStaticLoaderManifests(distDirectory);
      writeFileSync(path.resolve(distDirectory, ".anima-ssg-complete"), "");
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
