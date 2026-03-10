import { builtinModules } from "node:module";
import { defineConfig } from "vite";

export const external = [
  "electron",
  "better-sqlite3",
  ...builtinModules,
  ...builtinModules.map((moduleName) => `node:${moduleName}`)
];

export default defineConfig({
  resolve: {
    alias: {
      "@shared": "/src/shared",
      "@main": "/src/main",
      "@renderer": "/src/renderer"
    }
  },
  build: {
    sourcemap: true,
    emptyOutDir: false
  }
});
