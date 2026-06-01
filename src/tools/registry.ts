// src/tools/registry.ts
// Catálogo de ferramentas plugáveis. Cada agente ativa um subconjunto por nome
// (campo `ferramentas_ativas` na tabela `agents`). Você escreve uma vez, reusa em todos os tenants.

import type { ToolDefinition, RunContext } from "../types/index.ts";

/**
 * encaminhar_humano: presente em todos os templates. Marca a conversa para
 * intervenção humana. É a válvula de segurança que evita o agente insistir
 * em algo fora do escopo.
 */
const encaminharHumano: ToolDefinition = {
  schema: {
    name: "encaminhar_humano",
    description:
      "Encaminha a conversa para um atendente humano quando o pedido foge do escopo, " +
      "o usuário pede explicitamente, ou há risco de responder errado.",
    input_schema: {
      type: "object",
      properties: {
        motivo: {
          type: "string",
          description: "Motivo curto do encaminhamento.",
        },
      },
      required: ["motivo"],
    },
  },
  async execute(input, _ctx: RunContext) {
    const motivo = String(input.motivo ?? "não informado");
    return {
      content: `Conversa encaminhada para atendimento humano. Motivo: ${motivo}.`,
      escalar: true,
    };
  },
};

/**
 * consultar_status_demanda: exemplo de ferramenta que lê o banco do tenant.
 * Usa RPC para manter a query no servidor e respeitar o isolamento por tenant.
 */
const consultarStatusDemanda: ToolDefinition = {
  schema: {
    name: "consultar_status_demanda",
    description:
      "Consulta o andamento de uma demanda/protocolo pelo número informado pelo cidadão.",
    input_schema: {
      type: "object",
      properties: {
        protocolo: {
          type: "string",
          description: "Número do protocolo da demanda.",
        },
      },
      required: ["protocolo"],
    },
  },
  async execute(input, ctx: RunContext) {
    const protocolo = String(input.protocolo ?? "").trim();
    if (!protocolo) {
      return { content: "Protocolo não informado. Peça o número ao cidadão." };
    }
    // A função SQL recebe tenant_id explícito (backend valida o isolamento).
    const { data, error } = await ctx.db.rpc("consultar_demanda", {
      p_tenant_id: ctx.tenantId,
      p_protocolo: protocolo,
    });
    if (error) {
      return { content: `Não foi possível consultar agora (${error.message}).` };
    }
    if (!data) {
      return { content: `Nenhuma demanda encontrada para o protocolo ${protocolo}.` };
    }
    return { content: `Status da demanda ${protocolo}: ${JSON.stringify(data)}` };
  },
};

/** Mapa nome -> definição. Adicione novas ferramentas aqui. */
const ALL_TOOLS: Record<string, ToolDefinition> = {
  encaminhar_humano: encaminharHumano,
  consultar_status_demanda: consultarStatusDemanda,
};

/** Resolve as ferramentas ativas de um agente para [schemas, mapa de execução]. */
export function resolveTools(ferramentasAtivas: string[]): {
  schemas: ToolDefinition["schema"][];
  byName: Record<string, ToolDefinition>;
} {
  const byName: Record<string, ToolDefinition> = {};
  for (const nome of ferramentasAtivas) {
    const def = ALL_TOOLS[nome];
    if (def) byName[nome] = def;
    // nomes desconhecidos são ignorados silenciosamente (config tolerante a typo)
  }
  const schemas = Object.values(byName).map((d) => d.schema);
  return { schemas, byName };
}
