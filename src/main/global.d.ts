import type { LisnApi } from "@shared/types";

declare global {
  interface Window {
    lisn: LisnApi;
  }

  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
}

export {};
