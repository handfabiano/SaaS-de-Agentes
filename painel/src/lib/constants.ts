// src/lib/constants.ts
// Catálogos de domínio reutilizados pela UI. Casam com o backend (registry de
// ferramentas, modelos válidos no campo `modelo`, templates organizacionais).

export interface ModelOption {
  id: string;
  rotulo: string;
  /** Nota curta para ajudar a escolher (custo/capacidade). */
  nota: string;
}

/** Modelos válidos no campo `agents.modelo`. Default sugerido: Haiku. */
export const MODELS: ModelOption[] = [
  {
    id: "claude-haiku-4-5-20251001",
    rotulo: "Claude Haiku 4.5",
    nota: "Rápido e econômico — bom padrão para a maioria dos agentes.",
  },
  {
    id: "claude-sonnet-4-6",
    rotulo: "Claude Sonnet 4.6",
    nota: "Equilíbrio entre custo e capacidade.",
  },
  {
    id: "claude-opus-4-8",
    rotulo: "Claude Opus 4.8",
    nota: "Mais capaz e mais caro — para tarefas complexas.",
  },
];

export const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_TEMPERATURE = 0.3;

export function modelLabel(id: string): string {
  return MODELS.find((m) => m.id === id)?.rotulo ?? id;
}

/** Templates organizacionais — apenas rótulo, não muda lógica no painel. */
export const TEMPLATES: { value: string; label: string }[] = [
  { value: "", label: "— Sem template" },
  { value: "gabinete", label: "Gabinete" },
  { value: "evento", label: "Evento" },
  { value: "orgao", label: "Órgão público" },
  { value: "pme", label: "PME" },
];

export function templateLabel(value: string | null): string {
  if (!value) return "—";
  return TEMPLATES.find((t) => t.value === value)?.label ?? value;
}

export interface ToolOption {
  id: string;
  rotulo: string;
  descricao: string;
  /** Válvula de segurança: vem marcada e travada. */
  travada?: boolean;
}

/** Ferramentas possíveis em `ferramentas_ativas` (casam com o registry do backend). */
export const TOOLS: ToolOption[] = [
  {
    id: "encaminhar_humano",
    rotulo: "Encaminhar para humano",
    descricao:
      "Válvula de segurança: escala a conversa para um atendente quando foge do escopo.",
    travada: true,
  },
  {
    id: "consultar_status_demanda",
    rotulo: "Consultar status de demanda",
    descricao: "Consulta o andamento de uma demanda/protocolo pelo número.",
  },
  {
    id: "agendar",
    rotulo: "Agendar",
    descricao: "Cria ou consulta agendamentos para o contato.",
  },
  {
    id: "consultar_jogo",
    rotulo: "Consultar jogo",
    descricao: "Consulta informações de jogos/partidas.",
  },
  {
    id: "consultar_edital",
    rotulo: "Consultar edital",
    descricao: "Consulta editais e processos publicados.",
  },
];

/** Ferramentas que devem vir marcadas por padrão. */
export const DEFAULT_TOOLS = TOOLS.filter((t) => t.travada).map((t) => t.id);

export function toolLabel(id: string): string {
  return TOOLS.find((t) => t.id === id)?.rotulo ?? id;
}
