import type { LissenApi } from "@shared/types";

declare global {
  interface Window {
    lissen: LissenApi;
  }

  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
}

export {};
