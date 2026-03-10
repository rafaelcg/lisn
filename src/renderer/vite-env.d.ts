/// <reference types="vite/client" />

import type { LissenApi } from "@shared/types";

declare global {
  interface Window {
    lissen: LissenApi;
  }
}
