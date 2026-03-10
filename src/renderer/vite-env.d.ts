/// <reference types="vite/client" />

import type { LisnApi } from "@shared/types";

declare global {
  interface Window {
    lisn: LisnApi;
  }
}
