import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.base.config";

const rendererRoot = fileURLToPath(new URL("./src/renderer", import.meta.url));
const rendererEntry = fileURLToPath(new URL("./src/renderer/index.html", import.meta.url));
const rendererOutDir = fileURLToPath(new URL("./.vite/renderer/main_window", import.meta.url));

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: rendererRoot,
    plugins: [react()],
    build: {
      outDir: rendererOutDir,
      rollupOptions: {
        input: rendererEntry
      }
    }
  })
);
