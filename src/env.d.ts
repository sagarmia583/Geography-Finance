/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHEET_ID: string;
  readonly VITE_SCRIPT_URL: string;
  [key: string]: string | boolean | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
