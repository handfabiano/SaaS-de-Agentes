// src/webhook/deps.supabase.ts
// Implementa WebhookDeps sobre supabase-js (service_role) + client Anthropic.
// Estas são as "funções de dados" da FASE 3 do checklist de produção.

import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConfig, RunContext, SupabaseLike } from "../types/index.ts";
import { runAgent } from "../agent/loop.ts";
import { enviarTextoEvolution, type EvolutionCreds } from "./send.ts";
import type { AgenteResolvido, WebhookDeps } from "./types.ts";

interface Opcoes {
  supabase: SupabaseClient;
  anthropic: Anthropic;
}

/** Adapta o client supabase-js ao subconjunto `SupabaseLike` usado pelo motor. */
function comoSupabaseLike(supabase: SupabaseClient): SupabaseLike {
  return {
    rpc: (fn, args) =>
      supabase.rpc(fn, args) as unknown as ReturnType<SupabaseLike["rpc"]>,
    from: (table) => ({
      insert: (rows) =>
        supabase.from(table).insert(rows as never) as unknown as Promise<{
          error: { message: string } | null;
        }>,
    }),
  };
}

/** Lê as credenciais do Evolution de uma config de tool_configs (jsonb). */
function lerEvolutionCreds(
  config: Record<string, unknown>,
  instanciaFallback: string
): EvolutionCreds {
  const baseUrl = String(config.base_url ?? config.baseUrl ?? "");
  const apiKey = String(config.apikey ?? config.api_key ?? config.apiKey ?? "");
  const instancia = String(config.instancia ?? config.instance ?? instanciaFallback);
  return { baseUrl, apiKey, instancia };
}

export function criarWebhookDeps({ supabase, anthropic }: Opcoes): WebhookDeps {
  return {
    async resolverAgentePorInstancia(canal, instancia): Promise<AgenteResolvido | null> {
      // tool_configs guarda o mapeamento canal/instância → agente.
      // NOTA (FASE 4.2): mover apikey/baseUrl para o Vault; aqui aceitamos no
      // jsonb apenas para destravar o teste end-to-end.
      const { data: tcRows, error: tcErr } = await supabase
        .from("tool_configs")
        .select("tenant_id, ferramenta, config, ativo");
      if (tcErr || !tcRows) return null;

      // acha a config do canal cuja instância bate
      const wpp = tcRows.find(
        (r) =>
          r.ferramenta === canal &&
          r.ativo !== false &&
          String(
            (r.config as Record<string, unknown>)?.instancia ??
              (r.config as Record<string, unknown>)?.instance ??
              ""
          ) === instancia
      );
      if (!wpp) return null;

      const tenantId = wpp.tenant_id as string;
      const cfg = (wpp.config ?? {}) as Record<string, unknown>;
      const agentId = String(cfg.agent_id ?? cfg.agentId ?? "");
      if (!agentId) return null;

      const { data: agentRow, error: aErr } = await supabase
        .from("agents")
        .select(
          "id, tenant_id, nome, template, system_prompt, modelo, temperatura, ferramentas_ativas"
        )
        .eq("id", agentId)
        .eq("tenant_id", tenantId)
        .maybeSingle();
      if (aErr || !agentRow) return null;

      const config: AgentConfig = {
        id: agentRow.id as string,
        tenantId: agentRow.tenant_id as string,
        nome: agentRow.nome as string,
        template: (agentRow.template as string | null) ?? null,
        systemPrompt: (agentRow.system_prompt as string) ?? "",
        modelo: agentRow.modelo as string,
        temperatura: Number(agentRow.temperatura ?? 0.3),
        ferramentasAtivas: (agentRow.ferramentas_ativas as string[]) ?? [],
      };

      // toolConfigs do tenant (para as ferramentas que leem integrações)
      const toolConfigs: Record<string, Record<string, unknown>> = {};
      for (const r of tcRows) {
        if (r.tenant_id === tenantId) {
          toolConfigs[r.ferramenta as string] = (r.config ?? {}) as Record<
            string,
            unknown
          >;
        }
      }

      const creds = lerEvolutionCreds(cfg, instancia);
      return {
        config,
        toolConfigs,
        enviar: (contato, texto) => enviarTextoEvolution(creds, contato, texto),
      };
    },

    async mensagemJaProcessada(tenantId, externalId) {
      const { data } = await supabase
        .from("messages")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("external_id", externalId)
        .limit(1)
        .maybeSingle();
      return Boolean(data);
    },

    async obterOuCriarConversa(tenantId, agentId, canal, contatoExterno) {
      const { data: existente } = await supabase
        .from("conversations")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("agent_id", agentId)
        .eq("contato_externo", contatoExterno)
        .neq("status", "encerrada")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existente?.id) return existente.id as string;

      const { data: nova, error } = await supabase
        .from("conversations")
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          canal,
          contato_externo: contatoExterno,
          status: "aberta",
        })
        .select("id")
        .single();
      if (error || !nova) throw new Error(`obterOuCriarConversa: ${error?.message}`);
      return nova.id as string;
    },

    async carregarHistorico(tenantId, conversationId, limite = 12) {
      const { data } = await supabase
        .from("messages")
        .select("papel, conteudo, created_at")
        .eq("tenant_id", tenantId)
        .eq("conversation_id", conversationId)
        .in("papel", ["user", "assistant"])
        .order("created_at", { ascending: false })
        .limit(limite);
      const linhas = (data ?? []).slice().reverse();
      return linhas.map((m) => ({
        role: (m.papel === "assistant" ? "assistant" : "user") as "user" | "assistant",
        content: m.conteudo as string,
      })) as Anthropic.MessageParam[];
    },

    async salvarMensagemUsuario(tenantId, conversationId, conteudo, externalId) {
      const { error } = await supabase.from("messages").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        papel: "user",
        conteudo,
        external_id: externalId,
      });
      if (error) throw new Error(`salvarMensagemUsuario: ${error.message}`);
    },

    async salvarMensagemAssistente(tenantId, conversationId, conteudo) {
      const { error } = await supabase.from("messages").insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        papel: "assistant",
        conteudo,
      });
      if (error) throw new Error(`salvarMensagemAssistente: ${error.message}`);
    },

    async marcarEscalada(tenantId, conversationId) {
      await supabase
        .from("conversations")
        .update({ status: "escalada", escalada_em: new Date().toISOString() })
        .eq("tenant_id", tenantId)
        .eq("id", conversationId);
    },

    async contarMensagensUsuarioRecentes(tenantId, conversationId, desdeISO) {
      const { count } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("conversation_id", conversationId)
        .eq("papel", "user")
        .gte("created_at", desdeISO);
      return count ?? 0;
    },

    montarContexto(tenantId, agentId, conversationId, toolConfigs): RunContext {
      return {
        tenantId,
        agentId,
        conversationId,
        db: comoSupabaseLike(supabase),
        toolConfigs,
      };
    },

    executarAgente(config, ctx, historico, mensagemUsuario) {
      return runAgent(anthropic, config, ctx, historico, mensagemUsuario);
    },
  };
}
