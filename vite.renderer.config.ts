import { defineConfig, mergeConfig } from "vite";
import react from "@vitejs/plugin-react";
import baseConfig from "./vite.base.config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    root: "src/renderer",
    plugins: [react()]
  })
);
