import type { PenPalAPI } from "../electron/preload";

declare global {
  interface Window {
    penpal: PenPalAPI;
  }
}
