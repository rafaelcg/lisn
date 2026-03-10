import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const hasAppleSigningCredentials = Boolean(
  process.env.APPLE_CERTIFICATE_P12_BASE64 &&
    process.env.APPLE_CERTIFICATE_PASSWORD &&
    process.env.APPLE_TEAM_ID
);

const hasAppleNotarizationCredentials = Boolean(
  process.env.APPLE_API_KEY_PATH &&
    process.env.APPLE_API_KEY_ID &&
    process.env.APPLE_API_ISSUER
);

const config: ForgeConfig = {
  packagerConfig: {
    appBundleId: "com.rafael.lisn",
    name: "Lisn",
    osxSign: hasAppleSigningCredentials
      ? {
          identity: process.env.APPLE_SIGNING_IDENTITY,
          keychain: process.env.APPLE_KEYCHAIN_PATH
        }
      : undefined,
    osxNotarize: hasAppleSigningCredentials && hasAppleNotarizationCredentials
      ? {
          appleApiKey: process.env.APPLE_API_KEY_PATH!,
          appleApiKeyId: process.env.APPLE_API_KEY_ID!,
          appleApiIssuer: process.env.APPLE_API_ISSUER!
        }
      : undefined,
    prune: true,
    extraResource: [".lisn-build/LisnCaptureHelper"],
    ignore: (file) => {
      if (!file) {
        return false;
      }

      if (/^\/node_modules\/\.bin(\/|$)/.test(file)) {
        return true;
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
