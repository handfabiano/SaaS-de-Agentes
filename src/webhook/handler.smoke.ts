// src/webhook/handler.smoke.ts
// Teste de fumaça SEM rede do fluxo de webhook (FASE 3): injeta deps em memória
// e valida idempotência, fromMe, gravação de mensagens, resposta e escalada.
// Rodar com: npx tsx src/webhook/handler.smoke.ts

import type Anthropic from "@anthropic-ai/sdk";
import { processarMensagem } from "./handler.ts";
import type { MensagemRecebida, WebhookDeps } from "./types.ts";
import type { RunContext } from "../types/index.ts";

// ---- Estado em memória ----
const enviadas: { para: string; texto: string }[] = [];
const mensagens: { papel: string; conteudo: string; externalId?: string }[] = [];
const escaladas: string[] = [];
const processadas = new Set<string>();

function makeDeps(opts: { escalar?: boolean } = {}): WebhookDeps {
  return {
    async resolverAgentePorInstancia(_canal, instancia) {
      if (instancia !== "inst-1") return null;
      return {
        config: {
          id: "a1",
          tenantId: "t1",
          nome: "Agente Teste",
          template: null,
          systemPrompt: "teste",
          modelo: "claude-haiku-4-5-20251001",
          temperatura: 0.3,
          ferramentasAtivas: ["encaminhar_humano"],
        },
        toolConfigs: {},
        enviar: async (para, texto) => {
          enviadas.push({ para, texto });
        },
      };
    },
    async mensagemJaProcessada(_t, externalId) {
      return processadas.has(externalId);
    },
    async obterOuCriarConversa() {
      return "conv1";
    },
    async carregarHistorico() {
      return [] as Anthropic.MessageParam[];
    },
    async salvarMensagemUsuario(_t, _c, conteudo, externalId) {
      processadas.add(externalId);
      mensagens.push({ papel: "user", conteudo, externalId });
    },
    async salvarMensagemAssistente(_t, _c, conteudo) {
      mensagens.push({ papel: "assistant", conteudo });
    },
    async marcarEscalada(_t, conversationId) {
      escaladas.push(conversationId);
    },
    montarContexto(tenantId, agentId, conversationId, toolConfigs): RunContext {
      return {
        tenantId,
        agentId,
        conversationId,
        toolConfigs,
        db: {
          async rpc() {
            return { data: null, error: null };
          },
          from() {
            return {
              async insert() {
                return { error: null };
              },
            };
          },
        },
      };
    },
    async executarAgente(_config, _ctx, _hist, mensagemUsuario) {
      return {
        resposta: `Eco: ${mensagemUsuario}`,
        escalou: Boolean(opts.escalar),
      };
    },
  };
}

function msg(over: Partial<MensagemRecebida> = {}): MensagemRecebida {
  return {
    canal: "whatsapp",
    instancia: "inst-1",
    contatoExterno: "5511999999999",
    texto: "Olá",
    externalId: "ext-1",
    fromMe: false,
    ...over,
  };
}

async function main() {
  let falhou = false;
  const check = (cond: boolean, nome: string) => {
    console.log(`${cond ? "✅" : "❌"} ${nome}`);
    if (!cond) falhou = true;
  };

  // 1) fluxo feliz
  const deps = makeDeps();
  let r = await processarMensagem(deps, msg());
  check(r.status === "ok", "processa mensagem válida");
  check(enviadas.length === 1 && enviadas[0].texto === "Eco: Olá", "envia resposta");
  check(
    mensagens.some((m) => m.papel === "user") &&
      mensagens.some((m) => m.papel === "assistant"),
    "grava user + assistant"
  );

  // 2) idempotência (mesmo externalId)
  r = await processarMensagem(deps, msg());
  check(r.status === "duplicada", "ignora mensagem duplicada");

  // 3) fromMe
  r = await processarMensagem(deps, msg({ externalId: "ext-2", fromMe: true }));
  check(r.status === "ignorada_fromme", "ignora fromMe");

  // 4) instância sem agente
  r = await processarMensagem(deps, msg({ externalId: "ext-3", instancia: "x" }));
  check(r.status === "instancia_sem_agente", "instância não mapeada");

  // 5) escalada
  const depsEsc = makeDeps({ escalar: true });
  r = await processarMensagem(depsEsc, msg({ externalId: "ext-4" }));
  check(r.status === "ok" && escaladas.includes("conv1"), "marca escalada");

  console.log(falhou ? "\n❌ HANDLER SMOKE FALHOU" : "\n✅ HANDLER SMOKE PASSOU");
  if (falhou) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
