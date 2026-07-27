/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRESTASHOP_IMG_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
