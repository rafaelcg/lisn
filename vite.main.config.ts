import { defineConfig, mergeConfig } from "vite";
import baseConfig, { external } from "./vite.base.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    build: {
      rollupOptions: {
        external
      }
    }
  })
);
