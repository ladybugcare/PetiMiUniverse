/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_VET_WEB_URL: string;
  /** WhatsApp de suporte Hub (beta). Dígitos com DDI 55; vazio = item oculto. */
  readonly VITE_HUB_SUPPORT_WHATSAPP_PHONE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
