// supabase/functions/whatsapp-webhook/index.ts
// Edge Function (Deno) — recebe o webhook do Evolution (MESSAGES_UPSERT),
// normaliza, e delega ao handler agnóstico de canal que roda o agente.
//
// Sempre responde 200: o status real vai no corpo e nos logs. Isso evita que o
// Evolution reentregue o webhook em loop diante de um erro pontual.
//
// Secrets necessários (Edge Functions → Secrets):
//   ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Deploy: supabase functions deploy whatsapp-webhook

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { parseEvolution } from "../../../src/webhook/parse.ts";
import { criarWebhookDeps } from "../../../src/webhook/deps.supabase.ts";
import { processarMensagem } from "../../../src/webhook/handler.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
// Segredo compartilhado (FASE 8): só quem souber o segredo pode chamar o webhook.
// Defina WHATSAPP_WEBHOOK_SECRET e inclua na URL (?secret=) ou no header.
const WEBHOOK_SECRET = Deno.env.get("WHATSAPP_WEBHOOK_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});
const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const deps = criarWebhookDeps({ supabase, anthropic });

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Valida o segredo compartilhado (header x-webhook-secret ou ?secret=). */
function segredoValido(req: Request): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn("[whatsapp-webhook] WHATSAPP_WEBHOOK_SECRET não definido — aberto.");
    return true; // não quebra setups existentes; recomendado definir em produção
  }
  const header = req.headers.get("x-webhook-secret") ?? "";
  const query = new URL(req.url).searchParams.get("secret") ?? "";
  return header === WEBHOOK_SECRET || query === WEBHOOK_SECRET;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ status: "erro", detalhe: "use POST" }, 405);
  }

  if (!segredoValido(req)) {
    return json({ status: "erro", detalhe: "não autorizado" }, 401);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ status: "erro", detalhe: "json inválido" }, 200);
  }

  const msg = parseEvolution(body);
  if (!msg) {
    return json({ status: "ignorado", detalhe: "evento não processável" }, 200);
  }

  const resultado = await processarMensagem(deps, msg);
  console.log(
    `[whatsapp-webhook] ${resultado.status}` +
      (resultado.detalhe ? ` — ${resultado.detalhe}` : "")
  );
  return json(resultado, 200);
});
