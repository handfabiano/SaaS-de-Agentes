// src/agent/loop.ts
// Loop central do agente: recebe a mensagem do usuário, injeta contexto (RAG),
// chama o modelo, executa ferramentas em ciclo até o modelo parar, grava o uso.

import Anthropic from "@anthropic-ai/sdk";
import type { AgentConfig, RunContext } from "../types/index.ts";
import { resolveTools } from "../tools/registry.ts";
import { buscarContexto, formatarContexto } from "../lib/rag.ts";
import { registrarUso } from "../lib/usage.ts";

const MAX_TURNS = 6; // teto de idas e voltas de tool-calling por mensagem

export interface RunResult {
  resposta: string;
  escalou: boolean;
}

export async function runAgent(
  client: Anthropic,
  config: AgentConfig,
  ctx: RunContext,
  historico: Anthropic.MessageParam[],
  mensagemUsuario: string
): Promise<RunResult> {
  // 1) RAG: busca contexto relevante para a última pergunta.
  const chunks = await buscarContexto(mensagemUsuario, ctx);
  const contextoExtra = formatarContexto(chunks);

  // 2) System prompt com cache_control: o prefixo estável (prompt + base) é cacheado.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: config.systemPrompt + contextoExtra,
      cache_control: { type: "ephemeral" },
    },
  ];

  // 3) Ferramentas ativas deste agente.
  const { schemas, byName } = resolveTools(config.ferramentasAtivas);

  // 4) Histórico + nova mensagem do usuário.
  const messages: Anthropic.MessageParam[] = [
    ...historico,
    { role: "user", content: mensagemUsuario },
  ];

  let escalou = false;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const resp = await client.messages.create({
      model: config.modelo,
      max_tokens: 1024,
      temperature: config.temperatura,
      system,
      tools: schemas.length > 0 ? schemas : undefined,
      messages,
    });

    // grava consumo desta chamada
    await registrarUso(ctx, {
      modelo: config.modelo,
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      cacheReadTokens: resp.usage.cache_read_input_tokens ?? 0,
    });

    // adiciona a resposta do assistente ao histórico da volta
    messages.push({ role: "assistant", content: resp.content });

    // Se o modelo não pediu ferramenta, terminamos: extrai o texto.
    if (resp.stop_reason !== "tool_use") {
      const texto = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { resposta: texto, escalou };
    }

    // Caso contrário, executa cada tool_use e devolve os tool_result.
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of resp.content) {
      if (block.type !== "tool_use") continue;
      const def = byName[block.name];
      if (!def) {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: `Ferramenta ${block.name} não disponível.`,
          is_error: true,
        });
        continue;
      }
      const out = await def.execute(
        (block.input ?? {}) as Record<string, unknown>,
        ctx
      );
      if (out.escalar) escalou = true;
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: out.content,
      });
    }

    messages.push({ role: "user", content: toolResults });
    // segue para a próxima volta para o modelo responder com os resultados
  }

  // Atingiu o teto de voltas sem resposta final: encaminha por segurança.
  return {
    resposta:
      "Não consegui concluir agora. Vou encaminhar para um atendente humano.",
    escalou: true,
  };
}
