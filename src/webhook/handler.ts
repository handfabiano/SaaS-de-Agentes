// src/webhook/handler.ts
// Handler agnóstico de canal: recebe a mensagem já normalizada + as deps e roda
// o ciclo completo (idempotência → conversa → histórico → agente → resposta →
// escalada). Não conhece WhatsApp/Instagram diretamente — isso vem nas deps.

import type { MensagemRecebida, ResultadoWebhook, WebhookDeps } from "./types.ts";

const HISTORICO_LIMITE = 12; // últimas N mensagens carregadas como contexto

// Rate limit por contato (FASE 8): no máximo N mensagens por janela de tempo.
const RATE_MAX_MENSAGENS = 20;
const RATE_JANELA_SEGUNDOS = 60;

export async function processarMensagem(
  deps: WebhookDeps,
  msg: MensagemRecebida
): Promise<ResultadoWebhook> {
  // 1) Ignora mensagens enviadas pelo próprio número (evita loop).
  if (msg.fromMe) return { status: "ignorada_fromme" };

  // 2) Sem texto processável (áudio/sticker puro etc.).
  if (!msg.texto) return { status: "sem_texto" };

  // 3) Mapeia a instância → agente + tenant + forma de responder.
  const agente = await deps.resolverAgentePorInstancia(msg.canal, msg.instancia);
  if (!agente) {
    return {
      status: "instancia_sem_agente",
      detalhe: `instância "${msg.instancia}" não mapeada para nenhum agente`,
    };
  }
  const { config, toolConfigs, enviar } = agente;
  const tenantId = config.tenantId;
  const agentId = config.id;

  // 4) Idempotência: o Evolution reentrega webhooks.
  if (await deps.mensagemJaProcessada(tenantId, msg.externalId)) {
    return { status: "duplicada" };
  }

  try {
    // 5) Conversa (abre ou reusa) e histórico ANTES de gravar a msg atual.
    const conversationId = await deps.obterOuCriarConversa(
      tenantId,
      agentId,
      msg.canal,
      msg.contatoExterno
    );

    // 5b) Rate limit por contato: barra flood ANTES de chamar o modelo (custo).
    const desde = new Date(Date.now() - RATE_JANELA_SEGUNDOS * 1000).toISOString();
    const recentes = await deps.contarMensagensUsuarioRecentes(
      tenantId,
      conversationId,
      desde
    );
    if (recentes >= RATE_MAX_MENSAGENS) {
      return {
        status: "rate_limited",
        detalhe: `${recentes} msgs em ${RATE_JANELA_SEGUNDOS}s (limite ${RATE_MAX_MENSAGENS})`,
      };
    }

    const historico = await deps.carregarHistorico(
      tenantId,
      conversationId,
      HISTORICO_LIMITE
    );

    // 6) Registra a mensagem do usuário (com external_id p/ idempotência).
    await deps.salvarMensagemUsuario(
      tenantId,
      conversationId,
      msg.texto,
      msg.externalId
    );

    // 7) Executa o agente.
    const ctx = deps.montarContexto(tenantId, agentId, conversationId, toolConfigs);
    const resultado = await deps.executarAgente(config, ctx, historico, msg.texto);

    // 8) Grava a resposta e envia pelo canal.
    await deps.salvarMensagemAssistente(tenantId, conversationId, resultado.resposta);
    await enviar(msg.contatoExterno, resultado.resposta);

    // 9) Escalada para humano, se for o caso.
    if (resultado.escalou) {
      await deps.marcarEscalada(tenantId, conversationId);
    }

    return { status: "ok" };
  } catch (err) {
    const detalhe = err instanceof Error ? err.message : String(err);
    return { status: "erro", detalhe };
  }
}
