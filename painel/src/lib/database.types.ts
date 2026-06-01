// src/lib/database.types.ts
// Tipos que espelham as colunas usadas do schema Supabase (schema_agente_saas_v2.sql).
// Mantidos à mão para o painel — só o subconjunto que a UI consome.

export type Papel = "admin" | "operador";
export type Plano = "free" | "pro" | "premium";
export type ConversaStatus = "aberta" | "encerrada" | "escalada";
export type MensagemPapel = "user" | "assistant" | "tool";

export interface Tenant {
  id: string;
  nome: string;
  slug: string;
  plano: Plano;
  ativo: boolean;
}

export interface TenantMember {
  tenant_id: string;
  user_id: string;
  papel: Papel;
}

/** TenantMember com o tenant relacionado (vem do join em tenant_members). */
export interface MembershipWithTenant extends TenantMember {
  tenants: Tenant;
}

export interface Agent {
  id: string;
  tenant_id: string;
  nome: string;
  template: string | null;
  system_prompt: string;
  modelo: string;
  temperatura: number;
  ferramentas_ativas: string[];
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/** Campos editáveis de um agente (insert/update). */
export type AgentInput = Pick<
  Agent,
  | "tenant_id"
  | "nome"
  | "template"
  | "system_prompt"
  | "modelo"
  | "temperatura"
  | "ferramentas_ativas"
  | "ativo"
>;

export interface KnowledgeSource {
  id: string;
  tenant_id: string;
  agent_id: string;
  titulo: string;
  origem: string | null;
  created_at: string;
  /** Status de indexação — pode vir de uma coluna futura; tolerante a ausência. */
  status?: "processando" | "pronto" | "erro" | null;
}

export interface Conversation {
  id: string;
  tenant_id: string;
  agent_id: string;
  canal: string;
  contato_externo: string | null;
  status: ConversaStatus;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  papel: MensagemPapel;
  conteudo: string;
  created_at: string;
}

export interface UsageEvent {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  modelo: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  custo_estimado: number;
  created_at: string;
}
