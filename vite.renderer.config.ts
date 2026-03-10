import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.base.config";

const rendererRoot = fileURLToPath(new URL("./src/renderer", import.meta.url));
const rendererEntry = fileURLToPath(new URL("./src/renderer/index.html", import.meta.url));

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: rendererRoot,
    plugins: [react()],
    build: {
      rollupOptions: {
        input: rendererEntry
      }
    }
  })
);
