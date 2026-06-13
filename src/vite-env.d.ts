/// <reference types="vite/client" />

declare const __APP_BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_WORKER_URL: string;
  readonly PASSWORD_SALT: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
