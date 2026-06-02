// src/webhook/types.ts
// Tipos da camada de webhook. O handler é AGNÓSTICO de canal: recebe um evento
// já normalizado e um conjunto de "deps" (funções de dados + envio) injetadas.
// Assim o mesmo handler serve WhatsApp (Evolution), Instagram, etc.

import type Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, RunContext } from "../types/index.ts";

/** Mensagem de entrada já normalizada a partir do payload bruto do canal. */
export interface MensagemRecebida {
  canal: string; // "whatsapp" | "instagram" | ...
  instancia: string; // identifica qual conta/instância recebeu (→ mapeia p/ agente)
  contatoExterno: string; // número/handle do contato (destino da resposta)
  texto: string;
  externalId: string; // id da mensagem no provedor (idempotência)
  fromMe: boolean; // mensagem enviada pelo próprio número (ignorar)
}

/** Agente resolvido + credenciais do canal para responder. */
export interface AgenteResolvido {
  config: AgentConfig;
  /** Configs de integração por ferramenta (whatsapp, crm...), já resolvidas. */
  toolConfigs: Record<string, Record<string, unknown>>;
  /** Como responder neste canal (ex.: Evolution baseUrl/apikey/instância). */
  enviar: (contatoExterno: string, texto: string) => Promise<void>;
}

/**
 * Função que executa o agente. No backend real é o `runAgent` do motor já
 * "amarrado" com o client Anthropic. Mantido como dep para testar sem rede.
 */
export type ExecutarAgente = (
  config: AgentConfig,
  ctx: RunContext,
  historico: Anthropic.MessageParam[],
  mensagemUsuario: string
) => Promise<{ resposta: string; escalou: boolean }>;

/** Dependências injetadas no handler (implementadas sobre supabase-js). */
export interface WebhookDeps {
  /** Mapeia a instância do canal → agente + tenant + como responder. */
  resolverAgentePorInstancia: (
    canal: string,
    instancia: string
  ) => Promise<AgenteResolvido | null>;

  /** Idempotência: já gravamos esta mensagem (tenant_id, external_id)? */
  mensagemJaProcessada: (
    tenantId: string,
    externalId: string
  ) => Promise<boolean>;

  /** Conversa aberta para (agent_id, contato) ou cria uma nova. Retorna o id. */
  obterOuCriarConversa: (
    tenantId: string,
    agentId: string,
    canal: string,
    contatoExterno: string
  ) => Promise<string>;

  /** Histórico (últimas N) já no formato do modelo. NÃO inclui a msg atual. */
  carregarHistorico: (
    tenantId: string,
    conversationId: string,
    limite?: number
  ) => Promise<Anthropic.MessageParam[]>;

  salvarMensagemUsuario: (
    tenantId: string,
    conversationId: string,
    conteudo: string,
    externalId: string
  ) => Promise<void>;

  salvarMensagemAssistente: (
    tenantId: string,
    conversationId: string,
    conteudo: string
  ) => Promise<void>;

  /** Marca a conversa como escalada para atendimento humano. */
  marcarEscalada: (tenantId: string, conversationId: string) => Promise<void>;

  /** Constrói o RunContext (db + toolConfigs) para uma execução. */
  montarContexto: (
    tenantId: string,
    agentId: string,
    conversationId: string,
    toolConfigs: Record<string, Record<string, unknown>>
  ) => RunContext;

  /** Executa o agente (motor amarrado ao client Anthropic). */
  executarAgente: ExecutarAgente;

  /**
   * Rate limit (FASE 8): nº de mensagens do usuário nesta conversa desde `desdeISO`.
   * O handler usa para barrar flood de um mesmo contato antes de chamar o modelo.
   */
  contarMensagensUsuarioRecentes: (
    tenantId: string,
    conversationId: string,
    desdeISO: string
  ) => Promise<number>;
}

/** Resultado do processamento — útil para logs/observabilidade (FASE 8). */
export type StatusProcessamento =
  | "ok"
  | "ignorada_fromme"
  | "sem_texto"
  | "instancia_sem_agente"
  | "duplicada"
  | "rate_limited"
  | "erro";

export interface ResultadoWebhook {
  status: StatusProcessamento;
  detalhe?: string;
}
