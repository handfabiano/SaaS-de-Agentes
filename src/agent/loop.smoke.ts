// src/agent/loop.smoke.ts
// Teste de fumaça SEM rede: injeta um cliente Anthropic falso e um Supabase falso
// para validar que o loop executa ferramenta e retorna a resposta final.
// Rodar com: npx tsx src/agent/loop.smoke.ts

import type Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "./loop.ts";
import type { AgentConfig, RunContext, SupabaseLike } from "../types/index.ts";

// ---- Supabase falso ----
const usageInserts: unknown[] = [];
const fakeDb: SupabaseLike = {
  async rpc(fn, args) {
    if (fn === "match_chunks") {
      return {
        data: [{ id: "c1", conteudo: "Prazo de inscrição: até 10/06.", similaridade: 0.9 }],
        error: null,
      };
    }
    if (fn === "consultar_demanda") {
      return { data: { situacao: "Em análise", protocolo: args.p_protocolo }, error: null };
    }
    return { data: null, error: null };
  },
  from(_table) {
    return {
      async insert(rows) {
        usageInserts.push(rows);
        return { error: null };
      },
    };
  },
};

// ---- Anthropic falso: 1ª chamada pede ferramenta, 2ª responde texto ----
let chamada = 0;
const fakeClient = {
  messages: {
    async create(_params: unknown): Promise<Anthropic.Message> {
      chamada++;
      if (chamada === 1) {
        return {
          id: "m1",
          type: "message",
          role: "assistant",
          model: "claude-haiku-4-5-20251001",
          stop_reason: "tool_use",
          stop_sequence: null,
          usage: {
            input_tokens: 120,
            output_tokens: 30,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 0,
          },
          content: [
            {
              type: "tool_use",
              id: "tu_1",
              name: "consultar_status_demanda",
              input: { protocolo: "2026-001" },
            },
          ],
        } as unknown as Anthropic.Message;
      }
      return {
        id: "m2",
        type: "message",
        role: "assistant",
        model: "claude-haiku-4-5-20251001",
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: {
          input_tokens: 200,
          output_tokens: 40,
          cache_read_input_tokens: 180,
          cache_creation_input_tokens: 0,
        },
        content: [
          { type: "text", text: "Sua demanda 2026-001 está em análise." },
        ],
      } as unknown as Anthropic.Message;
    },
  },
} as unknown as Anthropic;

const config: AgentConfig = {
  id: "a1",
  tenantId: "t1",
  nome: "Agente Teste",
  template: "gabinete",
  systemPrompt: "Você é um atendente do gabinete.",
  modelo: "claude-haiku-4-5-20251001",
  temperatura: 0.3,
  ferramentasAtivas: ["consultar_status_demanda", "encaminhar_humano"],
};

const ctx: RunContext = {
  tenantId: "t1",
  agentId: "a1",
  conversationId: "conv1",
  db: fakeDb,
  toolConfigs: {},
};

async function main() {
  const res = await runAgent(fakeClient, config, ctx, [], "Qual o status do protocolo 2026-001?");
  console.log("RESPOSTA:", res.resposta);
  console.log("ESCALOU:", res.escalou);
  console.log("CHAMADAS AO MODELO:", chamada);
  console.log("USAGE EVENTS GRAVADOS:", usageInserts.length);

  // Asserções simples
  const ok =
    res.resposta.includes("em análise") &&
    res.escalou === false &&
    chamada === 2 &&
    usageInserts.length === 2;
  console.log(ok ? "\n✅ SMOKE TEST PASSOU" : "\n❌ SMOKE TEST FALHOU");
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
