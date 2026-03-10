import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "com.rafael.lisn",
    name: "Lisn",
    osxSign: {},
    prune: true,
    extraResource: [".lisn-build/LisnCaptureHelper"],
    ignore: (file) => {
      if (!file) {
        return false;
      }

      return ![
        /^\/\.vite/,
        /^\/node_modules/,
        /^\/package\.json$/
      ].some((pattern) => pattern.test(file));
    }
  },
  rebuildConfig: {},
  makers: [
    new MakerZIP({}, ["darwin"]),
    new MakerDMG({})
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: "src/main/main.ts",
          config: "vite.main.config.ts",
          target: "main"
        },
        {
          entry: "src/main/preload.ts",
          config: "vite.preload.config.ts",
          target: "preload"
        }
      ],
      renderer: [
        {
          name: "main_window",
          config: "vite.renderer.config.ts"
        }
      ]
    })
  ]
};

export default config;
