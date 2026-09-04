/// <reference types="vite/client" />

declare const __APP_BUILD_VERSION__: string | undefined;

declare global {
  var __APP_BUILD_VERSION__: string | undefined;
}

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
}
