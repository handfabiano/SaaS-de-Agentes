// src/lib/supabase.ts
// Cliente Supabase para o painel. Usa SOMENTE a chave pública (anon): o
// isolamento por tenant é garantido pelas policies de RLS do schema.
// A service_role NUNCA deve aparecer no front.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** True quando as variáveis de ambiente estão configuradas. */
export const supabaseConfigured = Boolean(url && anonKey);

if (!supabaseConfigured) {
  // Não derruba o app: a tela de login mostra um aviso amigável de configuração.
  console.warn(
    "[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY não configuradas. " +
      "Copie .env.example para .env e preencha."
  );
}

export const supabase = createClient(
  url ?? "http://localhost:54321",
  anonKey ?? "public-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
